const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// 环境变量配置 (原汁原味)
const FILE_PATH = process.env.FILE_PATH || '.tmp';   
const SUB_PATH = process.env.SUB_PATH || 'web/config.ini'; 
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        
const UUID = process.env.UUID || '56ddc300-0be5-4a00-b3ee-c52454c3ec31'; 
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'north.ww007.dpdns.org';          
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiMjQwYzdjMDliNzNjYWVkYWMzNzk4YjJjMmZlYzdlNTQiLCJ0IjoiZWMzYzU1MTUtZjUxNS00MmMyLTkyMzEtNzExZjFjNDllZDg3IiwicyI6Ik9HSXdNRGRsT1RZdFlUSXpPUzAwWVRBM0xUbGxNVGd0WVdVNE5UWmtabVl5WkRNMiJ9';              
const ARGO_PORT = process.env.ARGO_PORT || 9008; 
const CFIP = process.env.CFIP || 'www.udacity.com';           
const CFPORT = process.env.CFPORT || 443;                   
const NAME = process.env.NAME || 'North';                        

if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH);

// 深度伪装：随机名生成器
function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 核心程序和配置文件全部采用随机乱码名称
const webName = generateRandomName();
const botName = generateRandomName();
const confName = generateRandomName();

const webPath = path.join(FILE_PATH, webName);
const botPath = path.join(FILE_PATH, botName);
const configPath = path.join(FILE_PATH, confName); 
const subPath = path.join(FILE_PATH, 'runlog.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');

// 路由分发
app.use(express.static(path.join(__dirname, 'public')));
app.get(`/${SUB_PATH}`, (req, res) => {
  try {
    if (fs.existsSync(subPath)) {
        const content = fs.readFileSync(subPath, 'utf-8');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
    } else {
        res.status(503).send("Service Initializing...");
    }
  } catch (e) {
    res.status(503).send("Service Initializing...");
  }
});
app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.send("Service is running normally.");
});

function argoType() {
  if (ARGO_AUTH && ARGO_DOMAIN && ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
tunnel: ${ARGO_AUTH.split('"')[11]}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2

ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}

async function startserver() {
  argoType();

  // 运行前将底层伪装组件复制为随机名
  try {
    if (fs.existsSync(path.join(__dirname, 'sys_core'))) {
      fs.copyFileSync(path.join(__dirname, 'sys_core'), webPath);
      fs.chmodSync(webPath, 0o775);
    }
    if (fs.existsSync(path.join(__dirname, 'net_daemon'))) {
      fs.copyFileSync(path.join(__dirname, 'net_daemon'), botPath);
      fs.chmodSync(botPath, 0o775);
    }
  } catch (err) {}

  // 极致精简版的 Xray 配置：剔除流控、剔除多余 TCP，直接利用内部路由分发
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, 
        protocol: 'vless', 
        settings: { 
          clients: [{ id: UUID }], // 【修改1】已彻底删除 xtls-rprx-vision 流控
          decryption: 'none', 
          fallbacks: [
            { dest: parseInt(PORT) }, // 【修改2】非代理流量直接回落到前端伪装主页，删除了多余的 tcp vless
            { path: "/vless-argo", dest: 3002 }, 
            { path: "/ss-argo", dest: 3003 }, 
            { path: "/trojan-argo", dest: 3004 }
          ] 
        }, 
        streamSettings: { network: 'tcp' } 
      },
      // 三个纯正的 WS 入口
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "shadowsocks", settings: { method: "aes-256-gcm", password: UUID }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/ss-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } }
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  try {
    await exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {}

  if (fs.existsSync(botPath)) {
    let args;
    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    }
    try {
      await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {}
  }

  await extractDomains();
}

async function extractDomains() {
  let argoDomain;
  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    await generateLinks(argoDomain);
  } else {
    try {
      if (!fs.existsSync(bootLogPath)) {
        setTimeout(extractDomains, 2000);
        return;
      }
      const fileContent = fs.readFileSync(bootLogPath, 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) argoDomains.push(domainMatch[1]);
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        await generateLinks(argoDomain);
      } else {
        fs.unlinkSync(bootLogPath);
        async function killBotProcess() {
          try {
             await exec(`pkill -f "[${botName.charAt(0)}]${botName.substring(1)}" > /dev/null 2>&1`);
          } catch (error) {}
        }
        await killBotProcess();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
          await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains(); 
        } catch (error) {}
      }
    } catch (error) {
       setTimeout(extractDomains, 2000);
    }
  }
}

async function generateLinks(argoDomain) {
  const nodeName = NAME || 'Global-Fast';
  return new Promise((resolve) => {
    setTimeout(() => {
      const ssInfo = Buffer.from(`aes-256-gcm:${UUID}`).toString('base64');
      // 生成的均是标准的纯 ws 参数订阅，没有任何复杂属性
      const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=chrome&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS\nss://${ssInfo}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=chrome&type=ws&host=${argoDomain}&path=%2Fss-argo%3Fed%3D2560#${nodeName}-SS\ntrojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=chrome&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}-Trojan`;
      
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      resolve(subTxt);
    }, 2000);
  });
}

// 物理销毁：90秒后除了 runlog.txt 订阅信息，运行产生的所有随机名称组件全部自毁
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];  
    exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {});
  }, 90000);
}

startserver().catch(error => {});
cleanFiles();

app.listen(PORT, () => console.log(`Service Process Initialize Completed!`));