const { spawn } = require('child_process');
const child = spawn('npx -y @githumbi/angular-grab-mcp@latest', { stdio: 'inherit', shell: true });
child.on('exit', code => process.exit(code ?? 0));
