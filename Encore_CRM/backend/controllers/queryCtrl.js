const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const app = express();
const { logError } = require('../logger');

app.use(session({
    secret: 'EncoreMyob',
    resave: false,
    saveUninitialized: false
}));

// Logs Listing
const fs = require('fs');
const path = require('path');
exports.logsList = async (req, res) => { 
    try {
        const logsDir = path.join(__dirname, '../logs'); // Adjust path if logs folder is elsewhere
        fs.readdir(logsDir, (err, files) => {
            if (err) {
                console.error("Failed to read directory:", err);
                return res.status(500).send("Failed to read logs directory.");
            }
            // Filter .txt files only
            const logFiles = files.filter(file => file.endsWith('.xlsx'));
            res.status(200).send({ logs: logFiles });
        });
    } catch (err) {
        console.error(err);
        logError('logsList', err, req.user.user_ref_id);
        res.status(500).send("Logs Fetching Failed");
    }
};