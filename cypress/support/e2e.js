import "./commands";

after(() => {
  cy.task("failIfHealingOccurred");
});