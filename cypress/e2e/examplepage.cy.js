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
  it("form validation with self-healing selectors", () => {
    cy.visit("/");
    cy.smartGet("a[href*='tools']", { intent: "Find the Tools link in the navigation bar" }).click();
    cy.smartGet("a.my-link[href='/form-validation']", { intent: "Find the Form Validation link in the Tools section" }).click();

    cy.smartGet(".validationCustom01", { intent: "First name input field" }).clear().type("John");
    cy.smartGet(".validationCustom05[type='tel']", { intent: "Telephone input field" }).type("012-3456789");
    cy.smartGet("#validationCustom05[type='date']", { intent: "Date input field" }).type("2027-11-11");
    cy.smartGet("#validationCustom04",{ intent: "Payment method selection" }).select("card");

    cy.smartGet("#btn[type='submit']", { intent: "Submit button for the form" }).click();

    cy.smartGet("#alert-info", { intent: "Alert message container for form submission success" }).should("contain", "Thank you for validating your ticket");

  });
});