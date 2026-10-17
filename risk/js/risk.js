const RiskModule={scoreFromCount:n=>Math.min(100,Number(n||0)*5),getLevelFromScore:s=>CONFIG.RISK_LEVELS.find(x=>s>=x.min&&s<x.max)||CONFIG.RISK_LEVELS[0]};
