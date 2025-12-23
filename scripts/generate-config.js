#!/usr/bin/env node

/**
 * Script to generate canister-config.json from template
 * This is run during deployment to create the configuration file
 */

const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'canister-config.template.json');
const outputPath = path.join(__dirname, '..', 'canister-config.json');

// Check if config already exists
if (fs.existsSync(outputPath)) {
    console.log('canister-config.json already exists. Skipping generation.');
    console.log('To regenerate, delete canister-config.json and run this script again.');
    process.exit(0);
}

// Read template
if (!fs.existsSync(templatePath)) {
    console.error(`Template file not found: ${templatePath}`);
    process.exit(1);
}

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

// Write config file
fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
console.log(`Generated canister-config.json at ${outputPath}`);
console.log('Please update the contract addresses and event signatures in the config file.');

