/**
 * FILE: utils/defaultHouseRules.js
 * PURPOSE:
 * Single source of truth for the fallback House Rules text shown
 * whenever SystemSettings.houseRules is empty (fresh deployment,
 * admin hasn't opened Content > Policies yet). Used by:
 *   - app/visitor/policies/page.jsx (Policies page "House Rules" section)
 *   - services/bookingConfirmationEmail.js (Resort Rules block in the
 *     booking confirmation email)
 * Extracted here so both places show identical copy instead of two
 * hand-maintained lists drifting apart over time.
 */
export const DEFAULT_HOUSE_RULES = [
  "Quiet hours are observed from 10:00 PM to 7:00 AM. Loud music, gatherings, and any noise that may disturb other guests is not permitted during this period.",
  "Smoking is prohibited inside the room and enclosed areas. Designated outdoor smoking areas are available — please ask the front desk.",
  "Pets are not allowed on resort premises without prior written approval. Approved pets must remain within the guest's room at all times.",
  "All resort equipment and room furnishings must be treated with care. Guests will be charged for any deliberate or negligent damage to property.",
  "Outside food and beverages are permitted in the room. Outside food is not allowed in the resort's restaurant or common dining areas.",
  "The resort reserves the right to refuse service or remove any guest whose behavior is disruptive, threatening, or in violation of these house rules — without a refund.",
  "Children under 12 must be supervised by an adult at all times near the basketball court and playground.",
  "Single-use plastics are discouraged on resort grounds. Guests are encouraged to use the refillable water station provided in the room.",
];
