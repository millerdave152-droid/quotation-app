/**
 * QUOTATIONS API ROUTES
 * Handles creating, reading, updating quotations
 */

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    
    // Get all quotations
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT 
                    q.id,
                    q.quotation_number,
                    q.customer_name,
                    q.customer_email,
                    q.customer_phone,
                    q.status,
                    q.total_amount,
                    q.created_at,
                    q.updated_at,
                    COUNT(qi.id) as item_count
                FROM quotations q
                LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
                GROUP BY q.id
                ORDER BY q.created_at DESC
            `);
            
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching quotations:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get single quotation by ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
            // Get quotation details
            const quotationResult = await pool.query(
                'SELECT * FROM quotations WHERE id = $1',
                [id]
            );
            
            if (quotationResult.rows.length === 0) {
                return res.status(404).json({ error: 'Quotation not found' });
            }
            
            // Get quotation items
            const itemsResult = await pool.query(`
                SELECT 
                    qi.*,
                    p.manufacturer,
                    p.model,
                    p.description,
                    p.category
                FROM quotation_items qi
                LEFT JOIN products p ON qi.product_id = p.id
                WHERE qi.quotation_id = $1
                ORDER BY qi.id
            `, [id]);
            
            const quotation = quotationResult.rows[0];
            quotation.items = itemsResult.rows;
            
            res.json(quotation);
        } catch (error) {
            console.error('Error fetching quotation:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Create new quotation
    router.post('/', async (req, res) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const { customer_name, customer_email, customer_phone, items } = req.body;
            
            // Generate quotation number
            const quotationNumber = `QT-${Date.now()}`;
            
            // Calculate total
            let totalAmount = 0;
            items.forEach(item => {
                totalAmount += (item.unit_price * item.quantity);
            });
            
            // Insert quotation
            const quotationResult = await client.query(`
                INSERT INTO quotations (
                    quotation_number, customer_name, customer_email, 
                    customer_phone, status, total_amount
                ) VALUES ($1, $2, $3, $4, 'draft', $5)
                RETURNING *
            `, [quotationNumber, customer_name, customer_email, customer_phone, totalAmount]);
            
            const quotation = quotationResult.rows[0];
            
            // Insert quotation items
            for (const item of items) {
                await client.query(`
                    INSERT INTO quotation_items (
                        quotation_id, product_id, quantity, unit_price, total_price
                    ) VALUES ($1, $2, $3, $4, $5)
                `, [
                    quotation.id,
                    item.product_id,
                    item.quantity,
                    item.unit_price,
                    item.unit_price * item.quantity
                ]);
            }
            
            await client.query('COMMIT');
            
            res.status(201).json(quotation);
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating quotation:', error);
            res.status(500).json({ error: error.message });
        } finally {
            client.release();
        }
    });
    
    // Update quotation status
    router.patch('/:id/status', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            const result = await pool.query(`
                UPDATE quotations 
                SET status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [status, id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Quotation not found' });
            }
            
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating quotation status:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Delete quotation
    router.delete('/:id', async (req, res) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const { id } = req.params;
            
            // Delete quotation items first
            await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
            
            // Delete quotation
            const result = await client.query('DELETE FROM quotations WHERE id = $1 RETURNING *', [id]);
            
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Quotation not found' });
            }
            
            await client.query('COMMIT');
            
            res.json({ message: 'Quotation deleted successfully' });
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting quotation:', error);
            res.status(500).json({ error: error.message });
        } finally {
            client.release();
        }
    });
    
    return router;
};