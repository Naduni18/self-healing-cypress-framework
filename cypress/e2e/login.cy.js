describe("Login", () => {
  it("logs in with self-healing selectors", () => {
    cy.visit("/login");

    cy.smartGet(".name", { intent: "Find the username input field. It may have id username, name username, placeholder Username, or type text." }).type("practice");
    cy.smartGet("#password", { intent: "Password input field" }).type("SuperSecretPassword!");

    cy.smartGet("#login-btn", {
      intent: "Primary button that submits the login form, text may be Login or Sign in"
    }).click();

    cy.url().should("include", "/secure");
    cy.smartGet("#flash b", { intent: "Flash message container for login success" }).should("contain", "You logged into a secure area!");
  });
});