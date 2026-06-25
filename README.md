# Self-Healing Cypress Test Automation Framework

This project demonstrates a Cypress test automation framework that uses AI to recover when locators break.

Example:

If a test uses `#login-btn` but the application changes the button to `Sign in`, the framework captures the page DOM, asks AI for a better matching selector, validates the suggestion, caches it, and retries the action.

## Features

- Cypress end-to-end test automation
- AI-based locator healing
- Selector cache for reused healed locators
- DOM snapshot capture for failed selectors
- Safe validation before using AI-suggested selectors
- `.env` configuration for API keys

## Project Structure

```text
.
├── cypress/
│   ├── e2e/
│   │   └── login.cy.js
│   ├── fixtures/
│   │   └── healed-selectors.json
│   └── support/
│       ├── commands.js
│       └── e2e.js
├── cypress.config.js
├── package.json
├── .env
├── .gitignore
└── README.md
```

## Prerequisites

Install Node.js LTS:

```bash
node -v
npm -v
```

Install Git if you plan to upload the project to GitHub:

```bash
git --version
```

## Installation

Install project dependencies:

```bash
npm install
```

If starting from an empty folder:

```bash
npm init -y
npm install cypress openai dotenv
```

## Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
AI_HEALING=true
```

Do not commit `.env` to GitHub.

## Recommended `.gitignore`

```gitignore
node_modules/
.env
cypress/videos/
cypress/screenshots/
....
```

## Cypress Configuration

Add AI healing tasks in `cypress.config.js`:

```js
const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const healFile = path.join(__dirname, "cypress", "fixtures", "healed-selectors.json");

function readHealingCache() {
  if (!fs.existsSync(healFile)) return {};
  return JSON.parse(fs.readFileSync(healFile, "utf8") || "{}");
}

function writeHealingCache(cache) {
  fs.writeFileSync(healFile, JSON.stringify(cache, null, 2));
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
          cache[originalSelector] = healedSelector;
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
                  "Never return the original selector or any selector containing the broken id or class unless it exists in the DOM. " +
                  "Prefer visible matching elements using data-testid, aria-label, role, name, placeholder, button text, or stable attributes."
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

          return JSON.parse(response.output_text);
        }
      });

      return config;
    }
  }
});
```

## Custom Cypress Command

Add `smartGet` in `cypress/support/commands.js`:

```js
function compactDomSnapshot() {
  const interactive = [
    "button",
    "a",
    "input",
    "textarea",
    "select",
    "[role]",
    "[data-testid]",
    "[aria-label]"
  ].join(",");

  return Array.from(document.querySelectorAll(interactive))
    .slice(0, 120)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: el.className || null,
      text: el.innerText?.trim().slice(0, 80) || null,
      ariaLabel: el.getAttribute("aria-label"),
      role: el.getAttribute("role"),
      name: el.getAttribute("name"),
      type: el.getAttribute("type"),
      dataTestId: el.getAttribute("data-testid"),
      placeholder: el.getAttribute("placeholder")
    }));
}

Cypress.Commands.add("smartGet", (selector, options = {}) => {
  const intent = options.intent || `Find element for selector ${selector}`;
  const timeout = options.timeout || 4000;

  return cy.task("readHealingCache").then((cache) => {
    const cachedSelector = cache[selector];

    if (cachedSelector) {
      return cy.get("body").then(($body) => {
        if ($body.find(cachedSelector).length) {
          return cy.get(cachedSelector, { timeout });
        }

        return attemptHealing(selector, intent, timeout);
      });
    }

    return cy.get("body").then(($body) => {
      if ($body.find(selector).length) {
        return cy.get(selector, { timeout });
      }

      return attemptHealing(selector, intent, timeout);
    });
  });
});

function attemptHealing(selector, intent, timeout) {
  return cy.document().then(() => {
    const domSnapshot = compactDomSnapshot();

    return cy
      .task("healSelector", {
        originalSelector: selector,
        intent,
        domSnapshot
      })
      .then((result) => {
        if (!result || !result.selector) {
          throw new Error(`Could not heal selector: ${selector}`);
        }

        const suggestedSelector = result.selector;

        if (
          suggestedSelector === selector ||
          suggestedSelector.includes(selector.replace("#", "")) ||
          suggestedSelector.includes(selector.replace(".", ""))
        ) {
          throw new Error(`AI returned the broken selector again: "${suggestedSelector}".`);
        }

        return cy.get("body").then(($body) => {
          if (!$body.find(suggestedSelector).length) {
            throw new Error(
              `AI suggested selector "${suggestedSelector}", but it was not found. Reason: ${result.reason}`
            );
          }

          return cy
            .task("saveHealedSelector", {
              originalSelector: selector,
              healedSelector: suggestedSelector
            })
            .then(() => cy.get(suggestedSelector, { timeout }));
        });
      });
  });
}
```

Import commands in `cypress/support/e2e.js`:

```js
import "./commands";
```

## Example Test

Create `cypress/e2e/login.cy.js`:

```js
describe("Login", () => {
  it("logs in with self-healing selectors", () => {
    cy.visit("/login");

    cy.smartGet("#username", { intent: "Username input field" }).type("practice");
    cy.smartGet("#password", { intent: "Password input field" }).type("SuperSecretPassword!");

    cy.smartGet("#login-btn", {
      intent:
        "Find the visible login form submit button. It may have text Login, Sign in, or Submit. Do not use #login-btn if it is missing."
    }).click();
  });
});
```

## Run the Tests

Open Cypress UI:

```bash
npx cypress open
```

Run tests in terminal:

```bash
npx cypress run
```

Run a specific test:

```bash
npx cypress run --spec "cypress/e2e/login.cy.js"
```

## How Self-Healing Works

1. The test calls `cy.smartGet("#login-btn")`.
2. Cypress checks if the selector exists.
3. If the selector is missing, Cypress captures a compact DOM snapshot.
4. The DOM snapshot, original selector, and intent are sent to AI.
5. AI returns a replacement selector.
6. Cypress validates the replacement selector exists on the page.
7. The healed selector is saved in `cypress/fixtures/healed-selectors.json`.
8. Cypress retries the action using the healed selector.

## Example Healing Result

```json
{
  "#login-btn": "[data-testid='submit-login']"
}
```

## Notes

- Use AI healing as a fallback, not as the main selector strategy.
- Prefer stable selectors like `data-testid`, accessible roles, and labels.
- Review healed selectors before relying on them permanently.
- Never commit API keys or `.env` files.
