describe("Login", () => {
  it("logs in with self-healing selectors", () => {
    cy.visit("/login");

    cy.smartGet("#username", { intent: "username input field" }).type("practice");
    cy.smartGet("#password", { intent: "Password input field" }).type("SuperSecretPassword!");

    cy.smartGet("#login-btn", {
      intent: "Primary button that submits the login form, text may be Login or Sign in"
    }).click();

    cy.url().should("include", "/secure");
    cy.get("#flash b").should("contain", "You logged into a secure area!");
  });
});