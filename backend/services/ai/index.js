/**
 * AI Assistant Service - Main Orchestrator
 * TeleTime Solutions Customer Support Assistant
 *
 * Handles conversation flow, model routing, tool execution, and response generation
 */

const Anthropic = require('@anthropic-ai/sdk');
const { selectModel, MODELS } = require('./router');
const { assembleContext, getConversationHistory } = require('./context');
const { TOOLS, executeTools } = require('./tools');
const { buildSystemPrompt, classifyQuery } = require('./prompts/system');
const db = require('../../config/database');
const logger = require('./logger');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Cost per 1M tokens
const PRICING = {
  'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-latest': { input: 1.00, output: 5.00 },
  'claude-3-5-sonnet-latest': { input: 3.00, output: 15.00 }
};

/**
 * Main chat handler
 * Processes a user message and returns an AI response
 */
async function handleChat({
  conversationId,
  userMessage,
  userId,
  locationId = null
}) {
  const startTime = Date.now();
  let queryLogId = null;
  let error = null;

  try {
    // 1. Get or create conversation
    const conversation = await getOrCreateConversation(conversationId, userId, locationId);

    // 2. Get user info for context
    const user = await getUserInfo(userId);

    // 3. Get conversation history
    const history = await getConversationHistory(conversation.id);

    // 4. Classify the query type
    const queryType = classifyQuery(userMessage);

    // 5. Assemble RAG context based on query
    const ragContext = await assembleContext(userMessage, queryType, locationId);

    // 6. Determine which model to use
    const { model, reasons } = selectModel(userMessage, ragContext, history);

    // Log model routing decision
    logger.logModelRouting({
      query: userMessage,
      selectedModel: model,
      reasons,
      contextSize: ragContext.tokenCount || 0
    });

    // Log request start
    logger.logRequestStart({
      conversationId: conversation.id,
      userId,
      queryType,
      model
    });

    // 7. Build the full message array
    const messages = buildMessages(history, userMessage, ragContext);

    // 8. Build system prompt
    const systemPrompt = buildSystemPrompt(user, locationId, ragContext);

    // 9. Save user message to database
    const userMessageSeq = history.length + 1;
    const userMessageId = await saveMessage(conversation.id, 'user', userMessage, userMessageSeq);

    // 10. Create query log entry
    queryLogId = await createQueryLog({
      conversationId: conversation.id,
      userId,
      locationId,
      queryType,
      queryText: userMessage,
      messageId: userMessageId,
      routedToModel: model,
      routingReason: reasons.join(', '),
      contextSources: ragContext.sources,
      contextTokenCount: ragContext.tokenCount
    });

    // 11. Call the AI model
    const response = await callAnthropic({
      model,
      systemPrompt,
      messages,
      tools: TOOLS
    });

    // 12. Process the response (handle tool calls if any)
    const finalResponse = await processResponse(
      response,
      conversation.id,
      userMessageSeq + 1,
      model,
      userId,
      locationId
    );

    // 13. Calculate costs and update logs
    const responseTime = Date.now() - startTime;
    const cost = calculateCost(model, response.usage);

    await updateQueryLog(queryLogId, {
      responseTimeMs: responseTime,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      estimatedCostUsd: cost
    });

    // 14. Update conversation cost tracking
    await updateConversationCost(conversation.id, cost);

    // Log successful completion
    logger.logRequestComplete({
      conversationId: conversation.id,
      userId,
      queryType,
      model,
      responseTimeMs: responseTime,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: cost,
      toolsUsed: finalResponse.toolsUsed || []
    });

    return {
      conversationId: conversation.id,
      message: finalResponse.content,
      model: model,
      queryType,
      queryLogId, // Include for feedback
      responseTimeMs: responseTime,
      tokenUsage: response.usage,
      estimatedCost: cost
    };

  } catch (err) {
    const responseTime = Date.now() - startTime;

    // Log error with structured logger
    logger.logRequestError({
      conversationId: conversationId || 'unknown',
      userId,
      queryType: 'unknown',
      model: 'unknown',
      errorType: err.name || 'UnknownError',
      errorMessage: err.message,
      responseTimeMs: responseTime
    });

    // Update query log if we have one
    if (queryLogId) {
      await updateQueryLog(queryLogId, {
        errorOccurred: true,
        errorType: err.name || 'UnknownError',
        errorMessage: err.message,
        responseTimeMs: responseTime
      });
    }

    throw err;
  }
}

/**
 * Get or create a conversation
 */
async function getOrCreateConversation(conversationId, userId, locationId) {
  if (conversationId) {
    // Verify the conversation exists and belongs to this user
    const result = await db.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }
  }

  // Create new conversation
  const result = await db.query(
    `INSERT INTO ai_conversations (user_id, location_id)
     VALUES ($1, $2)
     RETURNING *`,
    [userId, locationId]
  );

  return result.rows[0];
}

/**
 * Get user info for context
 */
async function getUserInfo(userId) {
  const result = await db.query(
    `SELECT id, email, first_name, last_name, role, pos_role_id
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return result.rows[0];
}

/**
 * Build messages array for Anthropic API
 */
function buildMessages(history, userMessage, ragContext) {
  const messages = [];

  // Add conversation history
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    } else if (msg.role === 'tool_use' && msg.tool_input) {
      // Reconstruct tool use messages
      messages.push({
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: msg.tool_use_id,
          name: msg.tool_name,
          input: msg.tool_input
        }]
      });
    } else if (msg.role === 'tool_result' && msg.tool_result) {
      // tool_result content must be a string for Anthropic API
      const resultContent = typeof msg.tool_result === 'string'
        ? msg.tool_result
        : JSON.stringify(msg.tool_result);
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_use_id,
          content: resultContent
        }]
      });
    }
  }

  // Add current user message with context
  let enhancedMessage = userMessage;

  // Add RAG context as a system hint if relevant
  if (ragContext.contextText) {
    enhancedMessage = `${userMessage}\n\n[Context from database search]\n${ragContext.contextText}`;
  }

  messages.push({
    role: 'user',
    content: enhancedMessage
  });

  return messages;
}

/**
 * Call Anthropic API
 */
async function callAnthropic({ model, systemPrompt, messages, tools }) {
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages,
    tools: tools.length > 0 ? tools : undefined
  });

  return response;
}

/**
 * Process the response, handling tool calls if present
 */
async function processResponse(response, conversationId, sequenceNum, model, userId, locationId) {
  let currentSequence = sequenceNum;
  let currentResponse = response;
  const toolsUsed = []; // Track all tools used in this request

  // Keep processing while there are tool calls
  while (currentResponse.stop_reason === 'tool_use') {
    // Find tool use blocks
    const toolUseBlocks = currentResponse.content.filter(block => block.type === 'tool_use');

    // Save assistant message with tool calls
    for (const toolUse of toolUseBlocks) {
      toolsUsed.push(toolUse.name); // Track tool usage
      await saveMessage(conversationId, 'tool_use', '', currentSequence++, {
        toolName: toolUse.name,
        toolInput: toolUse.input,
        toolUseId: toolUse.id,
        model
      });
    }

    // Execute tools and collect results
    const toolStartTime = Date.now();
    const toolResults = await executeTools(toolUseBlocks, userId, locationId);
    const toolExecutionTime = Date.now() - toolStartTime;

    // Log tool execution
    logger.logToolExecution({
      toolName: toolUseBlocks.map(t => t.name).join(','),
      executionTimeMs: toolExecutionTime,
      success: !toolResults.some(r => r.result?.error),
      resultSize: JSON.stringify(toolResults).length
    });

    // Save tool results
    for (const result of toolResults) {
      await saveMessage(conversationId, 'tool_result', '', currentSequence++, {
        toolName: result.toolName,
        toolResult: result.result,
        toolUseId: result.toolUseId
      });
    }

    // Build messages for next API call (includes tool_results from database)
    const messages = await buildMessagesFromConversation(conversationId);

    // Call API again with tool results
    currentResponse = await anthropic.messages.create({
      model: model,
      max_tokens: 2048,
      messages: messages,
      tools: TOOLS
    });
  }

  // Extract text content from final response
  const textContent = currentResponse.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  // Save final assistant message
  await saveMessage(conversationId, 'assistant', textContent, currentSequence, {
    model,
    inputTokens: currentResponse.usage.input_tokens,
    outputTokens: currentResponse.usage.output_tokens
  });

  return {
    content: textContent,
    usage: currentResponse.usage,
    toolsUsed // Return tools used for logging
  };
}

/**
 * Build messages from stored conversation
 */
async function buildMessagesFromConversation(conversationId) {
  const history = await getConversationHistory(conversationId);
  const messages = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      messages.push({ role: 'assistant', content: msg.content });
    } else if (msg.role === 'tool_use') {
      messages.push({
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: msg.tool_use_id,
          name: msg.tool_name,
          input: msg.tool_input
        }]
      });
    } else if (msg.role === 'tool_result' && msg.tool_result) {
      // tool_result content must be a string for Anthropic API
      const resultContent = typeof msg.tool_result === 'string'
        ? msg.tool_result
        : JSON.stringify(msg.tool_result);
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_use_id,
          content: resultContent
        }]
      });
    }
  }

  return messages;
}

/**
 * Save a message to the database
 */
async function saveMessage(conversationId, role, content, sequenceNum, metadata = {}) {
  // Note: tool_input and tool_result are JSONB columns, so pass objects directly
  // The pg driver handles the JSON serialization
  const result = await db.query(
    `INSERT INTO ai_messages
     (conversation_id, role, content, sequence_num, tool_name, tool_input, tool_result, tool_use_id, model_used, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      conversationId,
      role,
      content,
      sequenceNum,
      metadata.toolName || null,
      metadata.toolInput || null,
      metadata.toolResult || null,
      metadata.toolUseId || null,
      metadata.model || null,
      metadata.inputTokens || null,
      metadata.outputTokens || null
    ]
  );
  return result.rows?.[0]?.id || null;
}

/**
 * Create a query log entry
 */
async function createQueryLog(data) {
  const result = await db.query(
    `INSERT INTO ai_query_logs
     (conversation_id, message_id, user_id, location_id, query_type, query_text, routed_to_model, routing_reason, context_sources, context_token_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      data.conversationId,
      data.messageId || null,
      data.userId,
      data.locationId,
      data.queryType,
      data.queryText,
      data.routedToModel,
      data.routingReason,
      JSON.stringify(data.contextSources || []),
      data.contextTokenCount || 0
    ]
  );

  return result.rows[0].id;
}

/**
 * Update query log with response metrics
 */
async function updateQueryLog(queryLogId, data) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (data.responseTimeMs !== undefined) {
    updates.push(`response_time_ms = $${paramIndex++}`);
    values.push(data.responseTimeMs);
  }
  if (data.inputTokens !== undefined) {
    updates.push(`input_tokens = $${paramIndex++}`);
    values.push(data.inputTokens);
  }
  if (data.outputTokens !== undefined) {
    updates.push(`output_tokens = $${paramIndex++}`);
    values.push(data.outputTokens);
  }
  if (data.totalTokens !== undefined) {
    updates.push(`total_tokens = $${paramIndex++}`);
    values.push(data.totalTokens);
  }
  if (data.estimatedCostUsd !== undefined) {
    updates.push(`estimated_cost_usd = $${paramIndex++}`);
    values.push(data.estimatedCostUsd);
  }
  if (data.errorOccurred !== undefined) {
    updates.push(`error_occurred = $${paramIndex++}`);
    values.push(data.errorOccurred);
  }
  if (data.errorType !== undefined) {
    updates.push(`error_type = $${paramIndex++}`);
    values.push(data.errorType);
  }
  if (data.errorMessage !== undefined) {
    updates.push(`error_message = $${paramIndex++}`);
    values.push(data.errorMessage);
  }

  if (updates.length > 0) {
    values.push(queryLogId);
    await db.query(
      `UPDATE ai_query_logs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }
}

/**
 * Update conversation cost tracking
 */
async function updateConversationCost(conversationId, cost) {
  await db.query(
    `UPDATE ai_conversations
     SET estimated_cost_usd = estimated_cost_usd + $1
     WHERE id = $2`,
    [cost, conversationId]
  );
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(model, usage) {
  const pricing = PRICING[model] || PRICING['claude-3-5-haiku-20241022'];
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Submit feedback for a query
 */
async function submitFeedback(queryLogId, feedback, notes = null, userId) {
  await db.query(
    `UPDATE ai_query_logs
     SET user_feedback = $1, feedback_notes = $2, feedback_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [feedback, notes, queryLogId]
  );
}

/**
 * Get conversation list for a user
 */
async function getConversations(userId, limit = 20, offset = 0) {
  const result = await db.query(
    `SELECT
       c.id,
       c.title,
       c.status,
       c.customer_context_id,
       c.created_at,
       c.last_message_at,
       c.total_input_tokens + c.total_output_tokens as total_tokens,
       c.estimated_cost_usd,
       (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY sequence_num ASC LIMIT 1) as first_message
     FROM ai_conversations c
     WHERE c.user_id = $1 AND c.status != 'deleted'
     ORDER BY c.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
}

/**
 * Get analytics for admin dashboard
 */
async function getAnalytics(days = 7) {
  const [daily, models, queryTypes, pilot] = await Promise.all([
    db.query(
      `SELECT * FROM ai_daily_stats
       WHERE date >= CURRENT_DATE - $1 * INTERVAL '1 day'
       ORDER BY date DESC`,
      [days]
    ),
    db.query(
      `SELECT * FROM ai_model_stats
       WHERE date >= CURRENT_DATE - $1 * INTERVAL '1 day'
       ORDER BY date DESC, model`,
      [days]
    ),
    db.query('SELECT * FROM ai_query_type_stats'),
    db.query('SELECT * FROM ai_pilot_dashboard')
  ]);

  return {
    daily: daily.rows,
    models: models.rows,
    queryTypes: queryTypes.rows,
    pilot: pilot.rows[0]
  };
}

module.exports = {
  handleChat,
  submitFeedback,
  getConversations,
  getConversationHistory,
  getAnalytics
};
