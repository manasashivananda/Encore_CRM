export const employeeStatus = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "In Active" },
];
export const cusStatus = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "In Active" },
];
export const roleStatus = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "In Active" },
];
export const roleCate = [
  { value: "design", label: "Design" },
  { value: "order-entry", label: "Order Entry" },
  { value: "super-admin", label: "Super Admin" },
  { value: "production", label: "Production" },
  { value: "production-manager", label: "Production Manager" },
];
export const orderStatus = [
  { value: "Order Created", label: "Order Created", color: "primary" },
  { value: "Order In Progress", label: "Order In Progress", color: "primary" },
  { value: "Order Hold", label: "Order Hold", color: "primary" },
  { value: "Production In Progress", label: "Production In Progress", color: "success" },
  { value: "Pushed To MYOB", label: "Pushed To MYOB", color: "success" },
  { value: "Ready For MYOB", label: "Ready For MYOB", color: "#027957" },
  { value: "Order Cancelled", label: "Cancelled Order", color: "#f00000" },
];
export const quotationStatus = [
  { value: "Quotation Created", label: "Quotation Created", color: "#005bc1" },
  { value: "QC Failed", label: "QC Failed", color: "#cb3702" },
  { value: "Quotation In Progress", label: "Quotation In Progress", color: "#b5c745" },
  { value: "Quote Converted To SO", label: "Quote Converted To SO", color: "#3f9301" },
];

export const orderProductionStatus = [
  { value: "1", label: "Roll" },
  { value: "2", label: "Rolled" },
  { value: "3", label: "Fold" },
  { value: "4", label: "Folded" },
  { value: "5", label: "Rack" },
  { value: "6", label: "Racked" },
  // { value: "7", label: "Load" },
  // { value: "8", label: "Loaded" },
  // { value: "9", label: "Transport" },
  // { value: "10", label: "Transported" },
  // { value: "11", label: "Delivery" },
  // { value: "12", label: "Delivered" },
];
export const departments = [
  { value: "F", label: "Flashing" },
  { value: "J", label: "Jobbing" },
  { value: "FG", label: "Fascia Gutter" },
  { value: "CL", label: "Cladding" },
  { value: "GBI", label: "GBI" },
  { value: "ROOF", label: "Roofing" },
  { value: "GBI.L", label: "GBI.L" },
];
export const deliveryAddress = [
  { value: "0", label: "Store Address" },
  { value: "1", label: "Site Address" },
  { value: "2", label: "Pickup Order" },
];
export const unitOfMeasurement = [
  { value: "PIECES", label: "PIECES" },
  { value: "METRE", label: "METRE" },
];
export const rackStatus = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "In Active" },
];
export const cityStatus = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "In Active" },
];
export const rackList = [
  { value: "R1", label: "R1" },
  { value: "R2", label: "R2" },
  { value: "R3", label: "R3" },
  { value: "R4", label: "R4" },
  { value: "R5", label: "R5" },
  { value: "R6", label: "R6" },
];

export const stateList = [
  { value: "VIC", label: "VIC" },
  { value: "NSW", label: "NSW" },
  { value: "QLD", label: "QLD" },
  { value: "SA", label: "SA" },
  { value: "WA", label: "WA" },
  { value: "TAS", label: "TAS" },
  { value: "NT", label: "NT" },
  { value: "ACT", label: "ACT" },
];

export const driverType = [
  { value: 1, label: "Permanent" },
  { value: 2, label: "Contract" },
  { value: 3, label: "Contract but Own Truck" },
  { value: 4, label: "Contract but Overtime" }
];

export const truckType = [
  { value: 1, label: "Permanent" },
  { value: 2, label: "Contract" },
  { value: 3, label: "Rented" },
];

export const runs_type = [
  { value: 1, label: "1st", disabled: false },
  { value: 2, label: "2nd", disabled: false },
  { value: 3, label: "3rd", disabled: false },
  { value: 4, label: "4th", disabled: false },
  { value: 5, label: "5th", disabled: false }
]

export const modes = [
  { value: 1, label: "Original" },
  { value: 2, label: "Custom" }
]

export const packs_pack_name = [
  { value: 1, label: "Auto" },
  { value: 2, label: "Manual" }
]

export const quantity = [
  { value: 1, label: "Auto" },
  { value: 2, label: "Split Equally" },
  { value: 3, label: "Manual" },
]

export const region = [
  { id: 1, value: "India", label: "India" },
  { id: 2, value: "Australia", label: "Australia" },
]

export const status = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "In Active" },
];

export const exportContent = [
  { value: 1, label: "Runs" },
  { value: 2, label: "Loading" },
  { value: 3, label: "Dockets" },
];

export const orderTypes = [
  { value: "External", label: "External" },
  { value: "Pickup", label: "Pickup" },
]