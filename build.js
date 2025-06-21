const fs = require('fs');
const path = require('path');

// Only generate config if we're in a production environment with env vars
const hasEnvVars = process.env.FIREBASE_API_KEY && process.env.FIREBASE_AUTH_DOMAIN;

if (hasEnvVars) {
    // Read environment variables
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };

    // Generate the config file content
    const configContent = `// Auto-generated config from environment variables
window.__firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
`;

    // Write to config.js
    fs.writeFileSync(path.join(__dirname, 'config.js'), configContent);
    console.log('Config file generated successfully from environment variables');
} else {
    console.log('No environment variables found. Using existing config.js for local development.');
} 