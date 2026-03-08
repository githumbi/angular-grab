const { spawn } = require('child_process');
const child = spawn('npx -y @nacho-labs/angular-grab-mcp@latest', { stdio: 'inherit', shell: true });
child.on('exit', code => process.exit(code ?? 0));
