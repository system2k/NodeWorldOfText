var { obfuscate } = require("javascript-obfuscator");
var fs = require("fs");
var path = require("path");

var settingsPath = path.resolve(process.cwd(), "../nwotdata/settings.json");
if (!fs.existsSync(settingsPath)) { // Do I even need this?
    settingsPath = path.resolve(process.cwd(), "settings_example.json");
}
var settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

class Antibot {
    checkSolves = [];
    solves = [];

    hash = Math.floor(Math.random() * 999);

    constructor() {
        this.clientChecks = (settings.antibot && settings.antibot.client_checks) || [];
        this.botGlobals = (settings.antibot && settings.antibot.bot_globals) || [];

        if (!this.clientChecks.length && !this.botGlobals.length) {
            this.enabled = false;
            return;
        }
        this.enabled = true;

        for (let i = 0; i < 3; i++) {
            this.solves.push(this.clientChecks[Math.floor(Math.random() * this.clientChecks.length)]);
        }

        for (let i = 0; i < this.solves.length; i++) {
            this.checkSolves.push(Math.floor(Math.random() * 999) + "");
        }
    }

    verifyMessage(ws, data) {
        if (!this.enabled) return false;
        if (!ws.sdata) return false;

        if (ws.sdata.antibot_verified) return false;

        if (ws.sdata.user && (ws.sdata.user.operator || ws.sdata.user.superuser || ws.sdata.user.staff)) {
            ws.sdata.antibot_verified = true;
            return false;
        }

        if (data.kind == "antibot_response") {
            if (this.verifyCode(data.code)) {
                ws.sdata.antibot_verified = true;
                return false;
            }
            return true;
        }

        return true;
    }

    sendChallenge(ws) {
        if (!this.enabled) return;
        if (!ws.sdata) return;
        var code = this.generateCode();
        try {
            ws.send(JSON.stringify({
                kind: "antibot_challenge",
                code: code
            }));
        } catch(e) {}
    }

    generateCode() {
        if (!this.enabled) return null;
        let clientChecksCode = this.solves.map((z, i) => {
            return `if(${z[0]} == ${JSON.stringify(z[1])}) parts.push("${this.checkSolves[i]}")`;
        });

        let botGlobalsCode = this.botGlobals.map((g) => {
            return `if(typeof ${g} !== "undefined") return 0`;
        });

        return obfuscate(
            `
                let parts = [];
                ${botGlobalsCode.join(";\n")}
                ${clientChecksCode.join(";\n")}
                return ${this.hash}*parts.map(z => z.split("").map(z => z.charCodeAt(0)).reduce((a, b)=>a+b)).reduce((a, b) => a + b);
            `,
            {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 1,
                numbersToExpressions: true,
                simplify: true,
                stringArrayShuffle: true,
                splitStrings: true,
                stringArrayThreshold: 0.52,
            },
        ).getObfuscatedCode();
    }

    verifyCode(code) {
        if (!this.enabled) return true;
        let solve = this.hash *
            this.checkSolves.map((z) =>
                z.split("").map((z) => z.charCodeAt(0)).reduce((a, b) => a + b)
            ).reduce((a, b) => a + b);

        if (solve !== code) {
            console.log(
                "Antibot failed! Code:",
                code,
                "Needed:",
                solve,
                "Hash:",
                this.hash,
                "Solves:",
                this.solves,
            );
        }
        return solve == code;
    }
}

module.exports = Antibot;
