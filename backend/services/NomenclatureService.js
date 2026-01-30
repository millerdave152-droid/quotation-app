/**
 * NomenclatureService
 * Handles model number decoding, quiz generation, and progress tracking
 * for the Training Center feature
 */

class NomenclatureService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 5 * 60; // 5 minutes

    // Manufacturer detection patterns (prefix -> manufacturer)
    // Order matters - more specific patterns first
    this.MANUFACTURER_PATTERNS = [
      // Café (GE subsidiary) - CDT, CDB, CHS, CGS, CVE, CXA, etc.
      { pattern: /^(C[DGHVXWYST][A-Z])/i, manufacturer: 'CAFE' },
      // Jenn-Air - JA, JB, JD, JE, JF, JG, JI, JJ, JM, JW, etc.
      { pattern: /^(J[ABDEFGIJMWSC])/i, manufacturer: 'JENN-AIR' },
      // GE/GE Profile - G prefix, P prefix (Profile), J prefix (including JP for cooktops)
      { pattern: /^(G[A-Z]{2}|P[HSTVWY][A-Z]|J[BGPST][A-Z]|JP[0-9])/i, manufacturer: 'GE' },
      // Samsung
      { pattern: /^(RF|RS|RT|RB|RH|RZ|WF|WA|WV|DVE|DVG|NE|NX|ME|DW)/i, manufacturer: 'SAMSUNG' },
      // LG
      { pattern: /^(LR|WM|WT|WK|DL|LD|LT|LW|OLED|QNED|LS)/i, manufacturer: 'LG' },
      // Whirlpool - WR (refrigerator), WF (washer front), WT (washer top), WC (cooktop), etc.
      { pattern: /^(WR|WF|WT|WE|WG|WD|WM|WO|WU|WV|WC|WB|WH)/i, manufacturer: 'WHIRLPOOL' },
      // KitchenAid
      { pattern: /^(K[RBDFWCSTEMVO])/i, manufacturer: 'KITCHENAID' },
      // Maytag
      { pattern: /^(M[HEWVFBDRT])/i, manufacturer: 'MAYTAG' },
      // Bosch
      { pattern: /^(SH[PVXE]|B[0-9]|HB|HG|HI)/i, manufacturer: 'BOSCH' },
      // Frigidaire / Frigidaire Professional - FF, FG, FP, EI, PC, PM, PL
      { pattern: /^(FF|FG|FP|EI|PC|PM|PL|FR|FD|FC)/i, manufacturer: 'FRIGIDAIRE' },
      // Electrolux
      { pattern: /^(EL|EW|EI|ER)/i, manufacturer: 'ELECTROLUX' },
      // Fulgor Milano
      { pattern: /^(F[0-9][A-Z])/i, manufacturer: 'FULGOR MILANO' },
      // Bertazzoni - MAST, PRO, REF, HER
      { pattern: /^(MAST|PRO|REF|HER)/i, manufacturer: 'BERTAZZONI' },
      // Danby
      { pattern: /^(D[ABDFPM][A-Z]|DAR|DCR|DFF|DWC)/i, manufacturer: 'DANBY' },
      // Napoleon
      { pattern: /^(S[0-9]|N[0-9]|BI|PR|RSE|LEX)/i, manufacturer: 'NAPOLEON' },
      // Fisher & Paykel
      { pattern: /^(RF|RS|DD|OR|OS)/i, manufacturer: 'FISHER & PAYKEL' },
      // Miele
      { pattern: /^(G[0-9]|H[0-9]|K[0-9]|T[0-9]|W[0-9])/i, manufacturer: 'MIELE' },
      // Thermador
      { pattern: /^(T[0-9]{2}|PO|PR|ME|CIT)/i, manufacturer: 'THERMADOR' },
      // Viking
      { pattern: /^(V[DEFGRST])/i, manufacturer: 'VIKING' },
      // Sub-Zero / Wolf
      { pattern: /^(BI|IC|IT|UC|CL)/i, manufacturer: 'SUB-ZERO' },
      { pattern: /^(DF|DO|GR|IR|SO|CT)/i, manufacturer: 'WOLF' },
      // Speed Queen
      { pattern: /^(TR|TC|DR|DC|SF|LF)/i, manufacturer: 'SPEED QUEEN' }
    ];
  }

  // ============================================
  // TEMPLATE MANAGEMENT
  // ============================================

  /**
   * Get all active templates
   */
  async getAllTemplates(options = {}) {
    const { manufacturer, productType, isActive = true } = options;

    let query = `
      SELECT t.*,
        (SELECT COUNT(*) FROM nomenclature_rules WHERE template_id = t.id) as rule_count
      FROM nomenclature_templates t
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (isActive !== null) {
      query += ` AND t.is_active = $${paramIndex++}`;
      params.push(isActive);
    }

    if (manufacturer) {
      query += ` AND UPPER(t.manufacturer) = UPPER($${paramIndex++})`;
      params.push(manufacturer);
    }

    if (productType) {
      query += ` AND LOWER(t.product_type) = LOWER($${paramIndex++})`;
      params.push(productType);
    }

    query += ' ORDER BY t.manufacturer, t.product_type';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get templates grouped by manufacturer
   */
  async getTemplatesGroupedByManufacturer() {
    const templates = await this.getAllTemplates({ isActive: true });

    const grouped = {};
    for (const template of templates) {
      const mfr = template.manufacturer.toUpperCase();
      if (!grouped[mfr]) {
        grouped[mfr] = [];
      }
      grouped[mfr].push(template);
    }

    return grouped;
  }

  /**
   * Get templates by manufacturer
   */
  async getTemplatesByManufacturer(manufacturer) {
    return this.getAllTemplates({ manufacturer, isActive: true });
  }

  /**
   * Get template with all rules and codes
   */
  async getTemplateWithRules(templateId) {
    // Get template
    const templateResult = await this.pool.query(`
      SELECT * FROM nomenclature_templates WHERE id = $1
    `, [templateId]);

    if (templateResult.rows.length === 0) {
      return null;
    }

    const template = templateResult.rows[0];

    // Get rules with codes
    const rulesResult = await this.pool.query(`
      SELECT r.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'code_value', c.code_value,
              'code_meaning', c.code_meaning,
              'additional_info', c.additional_info,
              'is_common', c.is_common
            ) ORDER BY c.display_order, c.code_value
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) as codes
      FROM nomenclature_rules r
      LEFT JOIN nomenclature_codes c ON r.id = c.rule_id
      WHERE r.template_id = $1
      GROUP BY r.id
      ORDER BY r.display_order, r.position_start
    `, [templateId]);

    template.rules = rulesResult.rows;
    return template;
  }

  /**
   * Get template by manufacturer and product type
   */
  async getTemplateByManufacturerAndType(manufacturer, productType) {
    const result = await this.pool.query(`
      SELECT id FROM nomenclature_templates
      WHERE UPPER(manufacturer) = UPPER($1) AND LOWER(product_type) = LOWER($2) AND is_active = true
    `, [manufacturer, productType]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.getTemplateWithRules(result.rows[0].id);
  }

  // ============================================
  // MODEL DECODING
  // ============================================

  /**
   * Auto-detect manufacturer from model number
   */
  autoDetectManufacturer(modelNumber) {
    const normalized = modelNumber.toUpperCase().trim();

    for (const { pattern, manufacturer } of this.MANUFACTURER_PATTERNS) {
      if (pattern.test(normalized)) {
        return manufacturer;
      }
    }

    return null;
  }

  /**
   * Decode a model number
   */
  async decodeModel(modelNumber, manufacturer = null) {
    const normalizedModel = modelNumber.toUpperCase().trim();

    // Auto-detect manufacturer if not provided
    if (!manufacturer) {
      manufacturer = this.autoDetectManufacturer(normalizedModel);
    }

    if (!manufacturer) {
      return {
        success: false,
        error: 'Could not detect manufacturer. Please specify manufacturer.',
        modelNumber: normalizedModel
      };
    }

    // Get all templates for this manufacturer
    const templates = await this.getTemplatesByManufacturer(manufacturer);

    if (templates.length === 0) {
      return {
        success: false,
        error: `No nomenclature templates found for ${manufacturer}`,
        modelNumber: normalizedModel,
        manufacturer
      };
    }

    // Try each template to find the best match
    let bestMatch = null;
    let bestConfidence = 0;

    for (const template of templates) {
      const fullTemplate = await this.getTemplateWithRules(template.id);
      const result = await this.decodeWithTemplate(normalizedModel, fullTemplate);

      if (result.confidence > bestConfidence) {
        bestConfidence = result.confidence;
        bestMatch = result;
      }
    }

    if (bestMatch && bestConfidence > 30) {
      return {
        success: true,
        data: bestMatch
      };
    }

    return {
      success: false,
      error: 'Could not decode model number with available templates',
      modelNumber: normalizedModel,
      manufacturer,
      partialMatch: bestMatch
    };
  }

  /**
   * Decode model with a specific template
   */
  async decodeWithTemplate(modelNumber, template) {
    const breakdown = [];
    let matchedChars = 0;
    let totalRuleChars = 0;

    for (const rule of template.rules) {
      const startIdx = rule.position_start - 1;
      const endIdx = rule.position_end;
      const segment = modelNumber.substring(startIdx, endIdx);

      if (!segment) continue;

      totalRuleChars += segment.length;

      // Look for matching code
      const matchingCode = rule.codes.find(c =>
        c.code_value.toUpperCase() === segment.toUpperCase()
      );

      const segmentResult = {
        segment: rule.segment_name,
        description: rule.segment_description,
        position: `${rule.position_start}-${rule.position_end}`,
        code: segment,
        meaning: matchingCode ? matchingCode.code_meaning : 'Unknown',
        additionalInfo: matchingCode ? matchingCode.additional_info : null,
        color: rule.color,
        matched: !!matchingCode
      };

      breakdown.push(segmentResult);

      if (matchingCode) {
        matchedChars += segment.length;
      }
    }

    // Calculate confidence based on how much of the model we could decode
    const confidence = totalRuleChars > 0
      ? Math.round((matchedChars / totalRuleChars) * 100)
      : 0;

    return {
      modelNumber,
      manufacturer: template.manufacturer,
      productType: template.product_type,
      templateName: template.template_name,
      templateDescription: template.description,
      exampleModels: template.example_models,
      breakdown,
      confidence,
      unknownSegments: breakdown.filter(b => !b.matched)
    };
  }

  /**
   * Batch decode multiple models
   */
  async batchDecode(models) {
    const results = [];

    for (const model of models) {
      const modelNumber = typeof model === 'string' ? model : model.modelNumber;
      const manufacturer = typeof model === 'string' ? null : model.manufacturer;

      const result = await this.decodeModel(modelNumber, manufacturer);
      results.push(result);
    }

    return results;
  }

  // ============================================
  // QUIZ GENERATION
  // ============================================

  /**
   * Generate quiz questions
   */
  async generateQuiz(options = {}) {
    const {
      quizType = 'mixed',
      manufacturer = null,
      productType = null,
      questionCount = 10,
      difficulty = 'medium'
    } = options;

    // Get available templates
    const templates = await this.getAllTemplates({
      manufacturer,
      productType,
      isActive: true
    });

    if (templates.length === 0) {
      throw new Error('No nomenclature templates available for quiz generation');
    }

    const questions = [];
    const usedQuestions = new Set();

    for (let i = 0; i < questionCount; i++) {
      // Select random template
      const template = templates[Math.floor(Math.random() * templates.length)];
      const fullTemplate = await this.getTemplateWithRules(template.id);

      // Select question type
      let questionType = quizType;
      if (quizType === 'mixed') {
        const types = ['decode', 'identify', 'match'];
        questionType = types[Math.floor(Math.random() * types.length)];
      }

      // Generate question
      const question = await this.generateQuestion(fullTemplate, questionType, difficulty, usedQuestions);
      if (question) {
        questions.push({
          id: `q${i}`,  // Add id for frontend answer tracking
          index: i,
          type: questionType,
          ...question
        });
      }
    }

    return {
      quizId: this.generateQuizId(),
      quizType,
      manufacturer,
      productType,
      questionCount: questions.length,
      difficulty,
      questions
    };
  }

  /**
   * Generate a single quiz question
   */
  async generateQuestion(template, questionType, difficulty, usedQuestions) {
    switch (questionType) {
      case 'decode':
        return this.generateDecodeQuestion(template, difficulty, usedQuestions);
      case 'identify':
        return this.generateIdentifyQuestion(template, difficulty, usedQuestions);
      case 'match':
        return this.generateMatchQuestion(template, difficulty, usedQuestions);
      default:
        return this.generateDecodeQuestion(template, difficulty, usedQuestions);
    }
  }

  /**
   * Generate a decode question - "What does 'RF' mean?"
   */
  generateDecodeQuestion(template, difficulty, usedQuestions) {
    // Get rules with codes
    const rulesWithCodes = template.rules.filter(r => r.codes && r.codes.length > 1);

    if (rulesWithCodes.length === 0) return null;

    // Select random rule
    const rule = rulesWithCodes[Math.floor(Math.random() * rulesWithCodes.length)];

    // Select random code (prefer common codes for easier difficulty)
    let codes = rule.codes;
    if (difficulty === 'easy') {
      const commonCodes = codes.filter(c => c.is_common);
      if (commonCodes.length > 0) codes = commonCodes;
    }

    const correctCode = codes[Math.floor(Math.random() * codes.length)];

    // Generate wrong answers from other codes
    const wrongAnswers = codes
      .filter(c => c.code_value !== correctCode.code_value)
      .slice(0, 3)
      .map(c => c.code_meaning);

    // If not enough wrong answers, add some generic ones
    while (wrongAnswers.length < 3) {
      wrongAnswers.push('Unknown/Not Used');
    }

    // Create unique key to avoid duplicates
    const questionKey = `decode:${template.manufacturer}:${rule.segment_name}:${correctCode.code_value}`;
    if (usedQuestions.has(questionKey)) return null;
    usedQuestions.add(questionKey);

    // Shuffle answers
    const allAnswers = this.shuffleArray([correctCode.code_meaning, ...wrongAnswers]);

    return {
      manufacturer: template.manufacturer,
      productType: template.product_type,
      question: `In ${template.manufacturer} ${template.product_type} model numbers, what does the code "${correctCode.code_value}" mean for ${rule.segment_name}?`,
      code: correctCode.code_value,
      segment: rule.segment_name,
      options: allAnswers,
      correctAnswer: correctCode.code_meaning,
      explanation: `The code "${correctCode.code_value}" indicates "${correctCode.code_meaning}" in the ${rule.segment_name} segment (positions ${rule.position_start}-${rule.position_end}).`
    };
  }

  /**
   * Generate an identify question - "Which segment indicates the capacity?"
   */
  generateIdentifyQuestion(template, difficulty, usedQuestions) {
    const rules = template.rules.filter(r => r.codes && r.codes.length > 0);
    if (rules.length < 2) return null;

    // Select random rule to ask about
    const targetRule = rules[Math.floor(Math.random() * rules.length)];

    // Create unique key
    const questionKey = `identify:${template.manufacturer}:${targetRule.segment_name}`;
    if (usedQuestions.has(questionKey)) return null;
    usedQuestions.add(questionKey);

    // Get example model
    const exampleModel = template.example_models?.[0] || 'MODEL12345';

    // Wrong answers are other segments
    const wrongSegments = rules
      .filter(r => r.segment_name !== targetRule.segment_name)
      .slice(0, 3)
      .map(r => r.segment_name);

    const allAnswers = this.shuffleArray([targetRule.segment_name, ...wrongSegments]);

    return {
      manufacturer: template.manufacturer,
      productType: template.product_type,
      question: `In a ${template.manufacturer} ${template.product_type} model number like "${exampleModel}", which segment indicates the ${targetRule.segment_description?.toLowerCase() || targetRule.segment_name.toLowerCase()}?`,
      exampleModel,
      options: allAnswers,
      correctAnswer: targetRule.segment_name,
      explanation: `The ${targetRule.segment_name} is found at positions ${targetRule.position_start}-${targetRule.position_end} and indicates ${targetRule.segment_description?.toLowerCase() || targetRule.segment_name.toLowerCase()}.`
    };
  }

  /**
   * Generate a match question - match codes to meanings
   */
  generateMatchQuestion(template, difficulty, usedQuestions) {
    // Get a rule with multiple codes
    const rulesWithCodes = template.rules.filter(r => r.codes && r.codes.length >= 3);
    if (rulesWithCodes.length === 0) return null;

    const rule = rulesWithCodes[Math.floor(Math.random() * rulesWithCodes.length)];

    // Create unique key
    const questionKey = `match:${template.manufacturer}:${rule.segment_name}`;
    if (usedQuestions.has(questionKey)) return null;
    usedQuestions.add(questionKey);

    // Select 4 codes to match
    const selectedCodes = this.shuffleArray([...rule.codes]).slice(0, 4);

    const pairs = selectedCodes.map(c => ({
      code: c.code_value,
      meaning: c.code_meaning
    }));

    // Shuffle meanings for the user to match
    const shuffledMeanings = this.shuffleArray(pairs.map(p => p.meaning));

    return {
      manufacturer: template.manufacturer,
      productType: template.product_type,
      question: `Match these ${template.manufacturer} ${rule.segment_name} codes to their meanings:`,
      segment: rule.segment_name,
      codes: pairs.map(p => p.code),
      meanings: shuffledMeanings,
      correctPairs: pairs,
      explanation: `These are ${rule.segment_name} codes used in ${template.manufacturer} ${template.product_type} model numbers.`
    };
  }

  /**
   * Submit quiz answers and calculate score
   */
  async submitQuiz(userId, quizData) {
    const { quizId, answers, quiz } = quizData;

    let correctCount = 0;
    const results = [];

    for (let i = 0; i < quiz.questions.length; i++) {
      const question = quiz.questions[i];
      // Support both index-based answers[0] and id-based answers[questionId] formats
      const userAnswer = answers[i] !== undefined ? answers[i] : answers[question.id];

      let isCorrect = false;

      if (question.type === 'match') {
        // For match questions, check if all pairs are correct
        isCorrect = this.checkMatchAnswer(question, userAnswer);
      } else {
        // For decode/identify, simple string comparison
        isCorrect = userAnswer === question.correctAnswer;
      }

      if (isCorrect) correctCount++;

      results.push({
        questionIndex: i,
        isCorrect,
        userAnswer,
        correctAnswer: question.correctAnswer || question.correctPairs,
        explanation: question.explanation
      });
    }

    const scorePercentage = Math.round((correctCount / quiz.questions.length) * 100);

    // Save quiz attempt to database
    if (userId) {
      await this.saveQuizAttempt(userId, {
        quizType: quiz.quizType,
        manufacturer: quiz.manufacturer,
        productType: quiz.productType,
        totalQuestions: quiz.questions.length,
        correctAnswers: correctCount,
        scorePercentage
      });

      // Update user progress
      if (quiz.manufacturer) {
        await this.updateUserProgress(userId, quiz.manufacturer, quiz.productType, {
          scorePercentage,
          questionsAnswered: quiz.questions.length,
          correctAnswers: correctCount
        });
      }
    }

    return {
      quizId,
      totalQuestions: quiz.questions.length,
      correctAnswers: correctCount,
      scorePercentage,
      results,
      masteryLevel: this.getMasteryLevel(scorePercentage)
    };
  }

  /**
   * Check match question answer
   */
  checkMatchAnswer(question, userAnswer) {
    if (!Array.isArray(userAnswer)) return false;

    for (const pair of question.correctPairs) {
      const userPair = userAnswer.find(a => a.code === pair.code);
      if (!userPair || userPair.meaning !== pair.meaning) {
        return false;
      }
    }
    return true;
  }

  /**
   * Save quiz attempt to database
   */
  async saveQuizAttempt(userId, attemptData) {
    await this.pool.query(`
      INSERT INTO nomenclature_quiz_attempts
        (user_id, quiz_type, manufacturer, product_type, total_questions, correct_answers, score_percentage)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      attemptData.quizType,
      attemptData.manufacturer,
      attemptData.productType,
      attemptData.totalQuestions,
      attemptData.correctAnswers,
      attemptData.scorePercentage
    ]);
  }

  // ============================================
  // PROGRESS TRACKING
  // ============================================

  /**
   * Update user progress
   */
  async updateUserProgress(userId, manufacturer, productType, quizResult) {
    const key = productType || '';

    // Get current progress
    const existing = await this.pool.query(`
      SELECT * FROM nomenclature_user_progress
      WHERE user_id = $1 AND manufacturer = $2 AND COALESCE(product_type, '') = $3
    `, [userId, manufacturer, key]);

    if (existing.rows.length > 0) {
      const current = existing.rows[0];
      const newTotal = current.total_questions_answered + quizResult.questionsAnswered;
      const newCorrect = current.correct_answers + quizResult.correctAnswers;
      const newQuizzes = current.quizzes_completed + 1;
      const bestScore = Math.max(current.best_score || 0, quizResult.scorePercentage);
      const masteryLevel = this.calculateMasteryLevel(newCorrect, newTotal, newQuizzes);

      await this.pool.query(`
        UPDATE nomenclature_user_progress SET
          quizzes_completed = $1,
          total_questions_answered = $2,
          correct_answers = $3,
          best_score = $4,
          last_quiz_date = CURRENT_TIMESTAMP,
          mastery_level = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [newQuizzes, newTotal, newCorrect, bestScore, masteryLevel, current.id]);
    } else {
      const masteryLevel = this.getMasteryLevel(quizResult.scorePercentage);

      await this.pool.query(`
        INSERT INTO nomenclature_user_progress
          (user_id, manufacturer, product_type, quizzes_completed, total_questions_answered, correct_answers, best_score, last_quiz_date, mastery_level)
        VALUES ($1, $2, $3, 1, $4, $5, $6, CURRENT_TIMESTAMP, $7)
      `, [userId, manufacturer, productType || null, quizResult.questionsAnswered, quizResult.correctAnswers, quizResult.scorePercentage, masteryLevel]);
    }
  }

  /**
   * Get user progress
   */
  async getUserProgress(userId) {
    const result = await this.pool.query(`
      SELECT
        manufacturer,
        product_type,
        quizzes_completed,
        total_questions_answered,
        correct_answers,
        best_score,
        last_quiz_date,
        mastery_level,
        CASE WHEN total_questions_answered > 0
          THEN ROUND((correct_answers::decimal / total_questions_answered) * 100, 1)
          ELSE 0
        END as accuracy
      FROM nomenclature_user_progress
      WHERE user_id = $1
      ORDER BY manufacturer, product_type
    `, [userId]);

    // Group by manufacturer
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.manufacturer]) {
        grouped[row.manufacturer] = {
          manufacturer: row.manufacturer,
          overall: null,
          productTypes: []
        };
      }

      if (row.product_type) {
        grouped[row.manufacturer].productTypes.push(row);
      } else {
        grouped[row.manufacturer].overall = row;
      }
    }

    return {
      byManufacturer: grouped,
      totalQuizzes: result.rows.reduce((sum, r) => sum + r.quizzes_completed, 0),
      totalQuestions: result.rows.reduce((sum, r) => sum + r.total_questions_answered, 0),
      totalCorrect: result.rows.reduce((sum, r) => sum + r.correct_answers, 0)
    };
  }

  /**
   * Get quiz history
   */
  async getQuizHistory(userId, limit = 20) {
    const result = await this.pool.query(`
      SELECT *
      FROM nomenclature_quiz_attempts
      WHERE user_id = $1
      ORDER BY completed_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(options = {}) {
    const { manufacturer, limit = 10 } = options;

    let query = `
      SELECT
        u.id as user_id,
        u.first_name,
        u.last_name,
        COUNT(qa.id) as total_quizzes,
        SUM(qa.total_questions) as total_questions,
        SUM(qa.correct_answers) as total_correct,
        ROUND(AVG(qa.score_percentage), 1) as avg_score,
        MAX(qa.score_percentage) as best_score
      FROM nomenclature_quiz_attempts qa
      JOIN users u ON qa.user_id = u.id
      WHERE qa.completed_at > NOW() - INTERVAL '30 days'
    `;

    const params = [];
    if (manufacturer) {
      query += ` AND UPPER(qa.manufacturer) = UPPER($1)`;
      params.push(manufacturer);
    }

    query += `
      GROUP BY u.id, u.first_name, u.last_name
      HAVING COUNT(qa.id) >= 3
      ORDER BY avg_score DESC, total_quizzes DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  /**
   * Create new template
   */
  async createTemplate(data, userId) {
    const result = await this.pool.query(`
      INSERT INTO nomenclature_templates
        (manufacturer, product_type, template_name, description, example_models, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      data.manufacturer.toUpperCase(),
      data.product_type.toLowerCase(),
      data.template_name,
      data.description,
      data.example_models || [],
      userId
    ]);

    return result.rows[0];
  }

  /**
   * Update template
   */
  async updateTemplate(templateId, data) {
    const result = await this.pool.query(`
      UPDATE nomenclature_templates SET
        template_name = COALESCE($2, template_name),
        description = COALESCE($3, description),
        example_models = COALESCE($4, example_models),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [templateId, data.template_name, data.description, data.example_models, data.is_active]);

    return result.rows[0];
  }

  /**
   * Add rule to template
   */
  async addRule(templateId, ruleData) {
    const result = await this.pool.query(`
      INSERT INTO nomenclature_rules
        (template_id, position_start, position_end, segment_name, segment_description, display_order, color)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      templateId,
      ruleData.position_start,
      ruleData.position_end,
      ruleData.segment_name,
      ruleData.segment_description,
      ruleData.display_order || 0,
      ruleData.color || '#3b82f6'
    ]);

    return result.rows[0];
  }

  /**
   * Add code to rule
   */
  async addCode(ruleId, codeData) {
    const result = await this.pool.query(`
      INSERT INTO nomenclature_codes
        (rule_id, code_value, code_meaning, additional_info, is_common)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (rule_id, code_value) DO UPDATE SET
        code_meaning = EXCLUDED.code_meaning,
        additional_info = EXCLUDED.additional_info,
        is_common = EXCLUDED.is_common
      RETURNING *
    `, [
      ruleId,
      codeData.code_value.toUpperCase(),
      codeData.code_meaning,
      codeData.additional_info,
      codeData.is_common || false
    ]);

    return result.rows[0];
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId) {
    await this.pool.query('DELETE FROM nomenclature_templates WHERE id = $1', [templateId]);
  }

  /**
   * Delete rule
   */
  async deleteRule(ruleId) {
    await this.pool.query('DELETE FROM nomenclature_rules WHERE id = $1', [ruleId]);
  }

  /**
   * Delete code
   */
  async deleteCode(codeId) {
    await this.pool.query('DELETE FROM nomenclature_codes WHERE id = $1', [codeId]);
  }

  // ============================================
  // FUZZY MATCHING
  // ============================================

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1, // substitution
            dp[i - 1][j] + 1,     // deletion
            dp[i][j - 1] + 1      // insertion
          );
        }
      }
    }
    return dp[m][n];
  }

  /**
   * Calculate similarity between 0 and 1
   */
  calculateSimilarity(str1, str2) {
    const s1 = str1.toUpperCase();
    const s2 = str2.toUpperCase();
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    const distance = this.levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }

  /**
   * Decode model with fuzzy matching for typos/OCR errors
   * @param {string} modelNumber - The model number (possibly with typos)
   * @param {number} threshold - Minimum similarity threshold (0-1, default 0.8)
   * @param {string} manufacturer - Optional manufacturer hint
   */
  async decodeModelFuzzy(modelNumber, threshold = 0.8, manufacturer = null) {
    const normalizedModel = modelNumber.toUpperCase().trim();

    // First try exact match
    const exactResult = await this.decodeModel(normalizedModel, manufacturer);
    if (exactResult.success && exactResult.data.confidence >= 70) {
      return exactResult;
    }

    // Auto-detect manufacturer if not provided
    if (!manufacturer) {
      manufacturer = this.autoDetectManufacturer(normalizedModel);
    }

    if (!manufacturer) {
      return {
        success: false,
        error: 'Could not detect manufacturer for fuzzy matching',
        modelNumber: normalizedModel,
        fuzzyMatches: []
      };
    }

    // Get all templates for this manufacturer
    const templates = await this.getTemplatesByManufacturer(manufacturer);
    if (templates.length === 0) {
      return {
        success: false,
        error: `No templates found for ${manufacturer}`,
        modelNumber: normalizedModel,
        fuzzyMatches: []
      };
    }

    const fuzzyMatches = [];

    // Try fuzzy matching against all codes in templates
    for (const template of templates) {
      const fullTemplate = await this.getTemplateWithRules(template.id);

      for (const rule of fullTemplate.rules) {
        const startIdx = rule.position_start - 1;
        const endIdx = rule.position_end;
        const segment = normalizedModel.substring(startIdx, endIdx);

        if (!segment) continue;

        for (const code of rule.codes) {
          const similarity = this.calculateSimilarity(segment, code.code_value);

          if (similarity >= threshold && similarity < 1) {
            fuzzyMatches.push({
              segment: rule.segment_name,
              original: segment,
              suggested: code.code_value,
              meaning: code.code_meaning,
              similarity: Math.round(similarity * 100),
              position: `${rule.position_start}-${rule.position_end}`
            });
          }
        }
      }
    }

    // Sort by similarity (highest first)
    fuzzyMatches.sort((a, b) => b.similarity - a.similarity);

    // If we have fuzzy matches, try to create a corrected model
    if (fuzzyMatches.length > 0) {
      let correctedModel = normalizedModel;
      const appliedCorrections = [];

      // Apply top correction for each segment (avoid overlapping corrections)
      const correctedSegments = new Set();
      for (const match of fuzzyMatches) {
        if (!correctedSegments.has(match.segment)) {
          const [start, end] = match.position.split('-').map(Number);
          correctedModel =
            correctedModel.substring(0, start - 1) +
            match.suggested +
            correctedModel.substring(end);
          correctedSegments.add(match.segment);
          appliedCorrections.push(match);
        }
      }

      // Try decoding the corrected model
      const correctedResult = await this.decodeModel(correctedModel, manufacturer);

      return {
        success: correctedResult.success,
        originalModel: normalizedModel,
        correctedModel,
        fuzzyMatches: appliedCorrections,
        data: correctedResult.success ? correctedResult.data : null,
        message: correctedResult.success
          ? `Found ${appliedCorrections.length} potential typo(s) and corrected`
          : 'Corrections applied but still could not fully decode'
      };
    }

    return {
      success: false,
      error: 'No fuzzy matches found above threshold',
      modelNumber: normalizedModel,
      manufacturer,
      fuzzyMatches: [],
      partialMatch: exactResult.partialMatch
    };
  }

  // ============================================
  // ATTRIBUTE EXTRACTION
  // ============================================

  /**
   * Extract structured product attributes from a decoded model
   */
  async extractProductAttributes(modelNumber, manufacturer = null) {
    const decodeResult = await this.decodeModel(modelNumber, manufacturer);

    if (!decodeResult.success) {
      return {
        success: false,
        error: decodeResult.error,
        modelNumber
      };
    }

    const decoded = decodeResult.data;
    const attributes = {
      brand: decoded.manufacturer,
      productType: decoded.productType,
      modelNumber: decoded.modelNumber,
      confidence: decoded.confidence
    };

    // Extract attributes from breakdown
    for (const segment of decoded.breakdown) {
      if (!segment.matched) continue;

      const segmentName = segment.segment.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const meaning = segment.meaning;

      // Common attribute mapping
      switch (segmentName) {
        case 'brand':
        case 'brand_prefix':
          attributes.brandCode = segment.code;
          break;

        case 'product_type':
        case 'product_category':
          attributes.productCategory = meaning;
          break;

        case 'style':
        case 'door_style':
        case 'configuration':
          attributes.style = meaning;
          break;

        case 'capacity':
        case 'size':
        case 'width':
          attributes.capacity = meaning;
          // Try to extract numeric value
          const capacityMatch = meaning.match(/(\d+(?:\.\d+)?)\s*(cu\.?\s*ft|liters?|L|inches?|\")/i);
          if (capacityMatch) {
            attributes.capacityValue = parseFloat(capacityMatch[1]);
            attributes.capacityUnit = capacityMatch[2].toLowerCase();
          }
          break;

        case 'color':
        case 'finish':
        case 'color_finish':
          attributes.color = meaning;
          // Normalize color names
          const colorLower = meaning.toLowerCase();
          if (colorLower.includes('stainless')) {
            attributes.colorFamily = 'Stainless Steel';
          } else if (colorLower.includes('white')) {
            attributes.colorFamily = 'White';
          } else if (colorLower.includes('black')) {
            attributes.colorFamily = 'Black';
          } else if (colorLower.includes('slate')) {
            attributes.colorFamily = 'Slate';
          }
          break;

        case 'features':
        case 'special_features':
        case 'feature_set':
          if (!attributes.features) attributes.features = [];
          attributes.features.push(meaning);
          break;

        case 'energy':
        case 'energy_rating':
        case 'efficiency':
          attributes.energyRating = meaning;
          if (meaning.toLowerCase().includes('energy star')) {
            attributes.isEnergyStar = true;
          }
          break;

        case 'series':
        case 'model_series':
          attributes.series = meaning;
          break;

        case 'year':
        case 'model_year':
          attributes.modelYear = meaning;
          const yearMatch = meaning.match(/20\d{2}/);
          if (yearMatch) {
            attributes.year = parseInt(yearMatch[0]);
          }
          break;

        case 'voltage':
        case 'power':
          attributes.voltage = meaning;
          break;

        case 'region':
        case 'market':
          attributes.region = meaning;
          break;

        default:
          // Store other segments as additional attributes
          if (!attributes.additionalAttributes) {
            attributes.additionalAttributes = {};
          }
          attributes.additionalAttributes[segmentName] = meaning;
      }
    }

    // Calculate feature summary
    if (decoded.breakdown.length > 0) {
      const matchedCount = decoded.breakdown.filter(b => b.matched).length;
      attributes.decodedSegments = matchedCount;
      attributes.totalSegments = decoded.breakdown.length;
    }

    return {
      success: true,
      modelNumber: decoded.modelNumber,
      attributes,
      breakdown: decoded.breakdown
    };
  }

  /**
   * Batch extract attributes for multiple models
   */
  async batchExtractAttributes(models) {
    const results = [];

    for (const model of models) {
      const modelNumber = typeof model === 'string' ? model : model.modelNumber;
      const manufacturer = typeof model === 'string' ? null : model.manufacturer;

      const result = await this.extractProductAttributes(modelNumber, manufacturer);
      results.push(result);
    }

    return results;
  }

  /**
   * Predict what an unknown code might mean based on context
   */
  async predictUnknownCode(code, context = {}) {
    const { manufacturer, segmentName, productType } = context;

    // Build query to find similar codes
    let query = `
      SELECT
        c.code_value,
        c.code_meaning,
        r.segment_name,
        t.manufacturer,
        t.product_type,
        COUNT(*) as occurrences
      FROM nomenclature_codes c
      JOIN nomenclature_rules r ON c.rule_id = r.id
      JOIN nomenclature_templates t ON r.template_id = t.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (manufacturer) {
      query += ` AND UPPER(t.manufacturer) = UPPER($${paramIndex++})`;
      params.push(manufacturer);
    }

    if (segmentName) {
      query += ` AND LOWER(r.segment_name) LIKE LOWER($${paramIndex++})`;
      params.push(`%${segmentName}%`);
    }

    if (productType) {
      query += ` AND LOWER(t.product_type) = LOWER($${paramIndex++})`;
      params.push(productType);
    }

    query += `
      GROUP BY c.code_value, c.code_meaning, r.segment_name, t.manufacturer, t.product_type
      ORDER BY occurrences DESC
      LIMIT 50
    `;

    const result = await this.pool.query(query, params);

    // Calculate similarity with each code
    const predictions = result.rows.map(row => ({
      ...row,
      similarity: this.calculateSimilarity(code, row.code_value)
    }))
    .filter(r => r.similarity >= 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

    return {
      code,
      context,
      predictions,
      bestGuess: predictions.length > 0 ? predictions[0] : null
    };
  }

  /**
   * Calculate detailed confidence with breakdown
   */
  calculateDetailedConfidence(breakdown) {
    if (!breakdown || breakdown.length === 0) {
      return { overall: 0, segments: [] };
    }

    const segmentScores = breakdown.map(segment => ({
      segment: segment.segment,
      matched: segment.matched,
      score: segment.matched ? 100 : 0,
      weight: 1 // Could be weighted by segment importance
    }));

    const totalWeight = segmentScores.reduce((sum, s) => sum + s.weight, 0);
    const weightedScore = segmentScores.reduce((sum, s) => sum + (s.score * s.weight), 0);
    const overall = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    return {
      overall,
      segments: segmentScores,
      matchedCount: segmentScores.filter(s => s.matched).length,
      totalCount: segmentScores.length,
      coverage: Math.round((segmentScores.filter(s => s.matched).length / segmentScores.length) * 100)
    };
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  generateQuizId() {
    return 'quiz_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getMasteryLevel(scorePercentage) {
    if (scorePercentage >= 95) return 'expert';
    if (scorePercentage >= 80) return 'advanced';
    if (scorePercentage >= 60) return 'intermediate';
    return 'beginner';
  }

  calculateMasteryLevel(correct, total, quizzes) {
    if (total === 0 || quizzes < 3) return 'beginner';
    const accuracy = (correct / total) * 100;
    return this.getMasteryLevel(accuracy);
  }
}

module.exports = NomenclatureService;
