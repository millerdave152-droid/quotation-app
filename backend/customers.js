/**
 * CUSTOMERS API ROUTES
 * Handles CRUD operations for customers
 */

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    
    // Get all customers
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT * FROM customers 
                ORDER BY created_at DESC
            `);
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching customers:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get single customer by ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(
                'SELECT * FROM customers WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }
            
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching customer:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Create new customer
    router.post('/', async (req, res) => {
        try {
            const { name, email, phone, address, notes } = req.body;
            
            const result = await pool.query(`
                INSERT INTO customers (name, email, phone, address, notes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [name, email, phone, address, notes]);
            
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating customer:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Update customer
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { name, email, phone, address, notes } = req.body;
            
            const result = await pool.query(`
                UPDATE customers 
                SET name = $1, email = $2, phone = $3, address = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
                RETURNING *
            `, [name, email, phone, address, notes, id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }
            
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating customer:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Delete customer
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'DELETE FROM customers WHERE id = $1 RETURNING *',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }
            
            res.json({ message: 'Customer deleted successfully' });
        } catch (error) {
            console.error('Error deleting customer:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    return router;
};