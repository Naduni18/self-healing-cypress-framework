function compactDomSnapshot(doc) {
    const interactive = [
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "[role]",
        "[data-testid]",
        "[aria-label]",
        "[name]",
        "[placeholder]",
        "[href]"
    ].join(",");

    return Array.from(doc.querySelectorAll(interactive))
        .slice(0, 150)
        .map((el) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            class: el.className || null,
            text: el.innerText?.trim().slice(0, 80) || null,
            ariaLabel: el.getAttribute("aria-label"),
            role: el.getAttribute("role"),
            name: el.getAttribute("name"),
            type: el.getAttribute("type"),
            dataTestId: el.getAttribute("data-testid"),
            placeholder: el.getAttribute("placeholder"),
            href: el.getAttribute("href"),
            value: el.getAttribute("value")
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
        const domSnapshot = compactDomSnapshot(doc);

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

                const suggestedSelector = result.selector.trim();

                if (suggestedSelector === selector) {
                    throw new Error(
                        `AI returned the exact broken selector again: "${suggestedSelector}". Original selector was "${selector}".`
                    );
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
                        .then(() => {
                            return cy.get(suggestedSelector, { timeout });
                        });
                });
            });
    });

}