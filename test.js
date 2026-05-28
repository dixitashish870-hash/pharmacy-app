const { app } = require('electron');
console.log('App is:', app);
setTimeout(() => { if (app) app.quit(); else process.exit(1); }, 1000);
