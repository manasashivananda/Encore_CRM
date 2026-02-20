// Added by Bhaskar c 
import { DateTime } from 'luxon';
const AWF_CUST_ID = localStorage.getItem("awfCustId");

// Insert a space before each uppercase letter, then trim any leading spaces
export function splitCamelCase(input) {
  return input.replace(/([A-Z])/g, ' $1').trim();
}
  

export function computeOrderFields(order) {
  const uid = order?.order_customer_UID || order?.account_UID;
  const origPO = order?.order_customer_PO_number ?? "";
  const origUnique = order?.order_unique_id;

  if (uid === AWF_CUST_ID) {
    const newOrderUniqueId = origPO.substring(0, 6);            // first 6 chars (safe if shorter)
    const rest = origPO.length > 6 ? origPO.substring(6) : "";  // remainder after 6 chars
    const newOrderCustomerPO = String(origUnique) + rest;       // use original unique id, then rest
    return {
      order_unique_id: newOrderUniqueId,
      order_customer_PO_number: newOrderCustomerPO
    };
  } else {
    return {
      order_unique_id: order?.order_unique_id,
      order_customer_PO_number: order?.order_customer_PO_number
    };
  }
}

export const getNextBusinessDay = () => {
    let nextDay = DateTime.now().plus({ days: 1 });
    const dayOfWeek = nextDay.weekday; // 1 = Monday, 5 = Friday, 6 = Saturday, 7 = Sunday
    
    if (dayOfWeek === 6) { // Saturday
        nextDay = nextDay.plus({ days: 2 }); // Skip to Monday
    } else if (dayOfWeek === 7) { // Sunday
        nextDay = nextDay.plus({ days: 1 }); // Skip to Monday
    }
    
    return nextDay;
};