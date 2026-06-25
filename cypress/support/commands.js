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
                    Cypress.log({
                        name: "smartGet",
                        message: `Using healed selector: ${selector} -> ${cachedSelector}`
                    });

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
    return cy.document().then((doc) => {
        const domSnapshot = compactDomSnapshot.call(doc);

        return cy
            .task("readHealingCache")
            .then((cache) => {
                return cy.task("healSelector", {
                    originalSelector: selector,
                    intent,
                    currentUrl: window.location.href,
                    specName: Cypress.spec.name,
                    selectorHistory: cache[selector]?.history || [],
                    domSnapshot
                });
            })
            .then((result) => {
                if (!result || !result.selector) {
                    throw new Error(`Could not heal selector: ${selector}`);
                }

                Cypress.log({
                    name: "AI Heal",
                    message: `${selector} -> ${result.selector} (${result.confidence})`
                });

                return cy.get("body").then(($body) => {
                    if (!$body.find(result.selector).length) {
                        throw new Error(
                            `AI suggested selector "${result.selector}", but it was not found. Reason: ${result.reason}`
                        );
                    }

                    const suggestedSelector = result.selector;

                    if (
                        suggestedSelector === selector ||
                        suggestedSelector.includes(selector.replace("#", "")) ||
                        suggestedSelector.includes(selector.replace(".", ""))
                    ) {
                        throw new Error(
                            `AI returned the broken selector again: "${suggestedSelector}". Try rerunning, or improve the intent.`
                        );
                    }

                    const screenshotName = `healing-${Date.now()}`;

                    cy.screenshot(screenshotName, { capture: "viewport" });

                    cy.task("logHealedSelector", {
                        spec: Cypress.spec.name,
                        url: window.location.href,
                        originalSelector: selector,
                        healedSelector: result.selector,
                        screenshot: `cypress/screenshots/${Cypress.spec.name}/${screenshotName}.png`,
                        reason: result.reason,
                        confidence: result.confidence
                    });

                    return cy.task("saveHealedSelector", {
                        originalSelector: selector,
                        healedSelector: result.selector
                    }).then(() => {
                        return cy.get(result.selector, { timeout });
                    });
                });
            });
    });
}