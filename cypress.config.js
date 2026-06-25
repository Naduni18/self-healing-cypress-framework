const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const healFile = path.join(__dirname, "cypress", "fixtures", "healed-selectors.json");

const healingReportFile = path.join(
    __dirname,
    "cypress",
    "reports",
    "healed-selectors-report.json"
);

function readHealingCache() {
    if (!fs.existsSync(healFile)) return {};
    return JSON.parse(fs.readFileSync(healFile, "utf8") || "{}");
}

function writeHealingCache(cache) {
    fs.writeFileSync(healFile, JSON.stringify(cache, null, 2));
}

function appendHealingReport(entry) {
    const dir = path.dirname(healingReportFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const existing = fs.existsSync(healingReportFile)
        ? JSON.parse(fs.readFileSync(healingReportFile, "utf8") || "[]")
        : [];

    existing.push({
        ...entry,
        healedAt: new Date().toISOString()
    });

    fs.writeFileSync(healingReportFile, JSON.stringify(existing, null, 2));
}

module.exports = defineConfig({
    e2e: {
        baseUrl: "https://practice.expandtesting.com",
        setupNodeEvents(on, config) {
            on("task", {
                readHealingCache() {
                    return readHealingCache();
                },

                saveHealedSelector({ originalSelector, healedSelector }) {
                    const cache = readHealingCache();

                    const previous = cache[originalSelector];
                    const previousHistory = Array.isArray(previous?.history)
                        ? previous.history
                        : [];

                    const history = [
                        originalSelector,
                        ...previousHistory,
                        healedSelector
                    ].filter(Boolean);

                    cache[originalSelector] = {
                        current: healedSelector,
                        history: [...new Set(history)]
                    };

                    writeHealingCache(cache);
                    return null;
                },

                async healSelector({ originalSelector, intent, domSnapshot }) {
                    if (process.env.AI_HEALING !== "true") return null;

                    const OpenAI = require("openai");
                    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

                    const response = await client.responses.create({
                        model: "gpt-5.2",
                        input: [
                            {
                                role: "developer",
                                content:
                                    "You repair broken Cypress selectors. Return only JSON. " +
                                    "Never return the original selector or any selector containing the broken id/class/text unless it exists in the DOM. " +
                                    "Prefer selectors for visible matching elements: data-testid, aria-label, role, name, placeholder, button text. " +
                                    "For a login button, prefer buttons with text like Login, Sign in, Submit, or stable attributes."
                            },
                            {
                                role: "user",
                                content: JSON.stringify({
                                    originalSelector,
                                    intent,
                                    domSnapshot
                                })
                            }
                        ],
                        text: {
                            format: {
                                type: "json_schema",
                                name: "selector_healing_result",
                                strict: true,
                                schema: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        selector: { type: "string" },
                                        reason: { type: "string" },
                                        confidence: { type: "number" }
                                    },
                                    required: ["selector", "reason", "confidence"]
                                }
                            }
                        }
                    });

                    const text = response.output_text;
                    return JSON.parse(text);
                },
                logHealedSelector(entry) {
                    appendHealingReport(entry);
                    return null;
                },

                failIfHealingOccurred() {
                    if (!fs.existsSync(healingReportFile)) return null;

                    const report = JSON.parse(fs.readFileSync(healingReportFile, "utf8") || "[]");

                    if (process.env.CI === "true" && report.length > 0) {
                        throw new Error(
                            `AI healed ${report.length} selector(s). Review cypress/reports/healed-selectors-report.json and update tests.`
                        );
                    }

                    return null;
                }
            });

            return config;
        }
    }
});