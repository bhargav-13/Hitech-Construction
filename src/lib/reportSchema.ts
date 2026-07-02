export type ColumnType = "text" | "date" | "currency" | "number" | "status" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportFilter {
  label: string;
  type: "select" | "date";
}

const has = (name: string, ...keywords: string[]) => {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
};

export function getReportColumns(name: string, category: string): ReportColumn[] {
  if (name === "Company Sales Report") {
    return [
      { key: "invoiceDate", label: "Invoice Date", type: "date" },
      { key: "saleType", label: "Sale Type", type: "text" },
      { key: "clientName", label: "Client Name", type: "text" },
      { key: "projectName", label: "Project Name", type: "text" },
      { key: "invoiceNumber", label: "Invoice Number", type: "text" },
      { key: "totalAmount", label: "Total Amount", type: "currency" },
      { key: "retentionAmount", label: "Retention Amount", type: "currency" },
      { key: "postTaxDeduction", label: "Post Tax Deduction", type: "currency" },
    ];
  }
  if (has(name, "attendance")) {
    return [
      { key: "workerName", label: "Worker Name", type: "text" },
      { key: "projectName", label: "Project Name", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "checkIn", label: "Check In", type: "text" },
      { key: "checkOut", label: "Check Out", type: "text" },
      { key: "hours", label: "Hours", type: "number" },
      { key: "status", label: "Status", type: "status" },
    ];
  }
  if (has(name, "library")) {
    return [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "unit", label: "Unit", type: "text" },
      { key: "rate", label: "Rate", type: "currency" },
    ];
  }
  if (has(name, "boq", "quotation", "measurement book", "bom")) {
    return [
      { key: "itemCode", label: "Item Code", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "unit", label: "Unit", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "rate", label: "Rate", type: "currency" },
      { key: "amount", label: "Amount", type: "currency" },
    ];
  }
  if (has(name, "budget", "vs actual")) {
    return [
      { key: "costCode", label: "Cost Code", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "budgetedAmount", label: "Budgeted Amount", type: "currency" },
      { key: "actualAmount", label: "Actual Amount", type: "currency" },
      { key: "variance", label: "Variance", type: "currency" },
    ];
  }
  if (has(name, "gstr")) {
    return [
      { key: "invoiceNumber", label: "Invoice Number", type: "text" },
      { key: "partyName", label: "Party Name", type: "text" },
      { key: "gstin", label: "GSTIN", type: "text" },
      { key: "taxableValue", label: "Taxable Value", type: "currency" },
      { key: "taxRate", label: "Tax Rate", type: "percent" },
      { key: "taxAmount", label: "Tax Amount", type: "currency" },
      { key: "total", label: "Total", type: "currency" },
    ];
  }
  if (has(name, "stock", "warehouse", "material received", "material issued")) {
    return [
      { key: "materialName", label: "Material Name", type: "text" },
      { key: "warehouse", label: "Warehouse", type: "text" },
      { key: "openingQty", label: "Opening Qty", type: "number" },
      { key: "receivedQty", label: "Received Qty", type: "number" },
      { key: "issuedQty", label: "Issued Qty", type: "number" },
      { key: "closingQty", label: "Closing Qty", type: "number" },
    ];
  }
  if (has(name, "payment", "bank statement")) {
    return [
      { key: "paymentDate", label: "Payment Date", type: "date" },
      { key: "partyName", label: "Party Name", type: "text" },
      { key: "projectName", label: "Project Name", type: "text" },
      { key: "paymentType", label: "Payment Type", type: "text" },
      { key: "amount", label: "Amount", type: "currency" },
    ];
  }
  if (has(name, "leaderboard")) {
    return [
      { key: "rank", label: "Rank", type: "number" },
      { key: "name", label: "Name", type: "text" },
      { key: "tasksCompleted", label: "Tasks Completed", type: "number" },
      { key: "score", label: "Score", type: "number" },
    ];
  }
  if (has(name, "p&l", "transactions", "financial summary")) {
    return [
      { key: "month", label: "Month", type: "text" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "expense", label: "Expense", type: "currency" },
      { key: "profit", label: "Profit", type: "currency" },
    ];
  }
  if (has(name, "task", "progress", "site inspection", "to do", "operational summary")) {
    return [
      { key: "taskName", label: "Task Name", type: "text" },
      { key: "projectName", label: "Project Name", type: "text" },
      { key: "assignedTo", label: "Assigned To", type: "text" },
      { key: "dueDate", label: "Due Date", type: "date" },
      { key: "status", label: "Status", type: "status" },
    ];
  }
  if (has(name, "lead", "crm")) {
    return [
      { key: "leadName", label: "Lead Name", type: "text" },
      { key: "company", label: "Company", type: "text" },
      { key: "stage", label: "Stage", type: "status" },
      { key: "assignedTo", label: "Assigned To", type: "text" },
      { key: "createdDate", label: "Created Date", type: "date" },
    ];
  }
  if (category === "Party Balances" || has(name, "subcon", "party", "vendor", "outstanding")) {
    return [
      { key: "partyName", label: "Party Name", type: "text" },
      { key: "partyType", label: "Party Type", type: "text" },
      { key: "totalBilled", label: "Total Billed", type: "currency" },
      { key: "totalPaid", label: "Total Paid", type: "currency" },
      { key: "balance", label: "Balance", type: "currency" },
    ];
  }
  if (category === "Sales") {
    return [
      { key: "invoiceDate", label: "Invoice Date", type: "date" },
      { key: "clientName", label: "Client Name", type: "text" },
      { key: "projectName", label: "Project Name", type: "text" },
      { key: "totalAmount", label: "Total Amount", type: "currency" },
    ];
  }
  return [
    { key: "date", label: "Date", type: "date" },
    { key: "referenceNo", label: "Reference No", type: "text" },
    { key: "projectName", label: "Project Name", type: "text" },
    { key: "amount", label: "Amount", type: "currency" },
    { key: "status", label: "Status", type: "status" },
  ];
}

export function getReportFilters(name: string, category: string): ReportFilter[] {
  if (name === "Company Sales Report") {
    return [
      { label: "Client Name", type: "select" },
      { label: "Project Name", type: "select" },
      { label: "Invoice Date", type: "date" },
      { label: "Sale Type", type: "select" },
      { label: "Creator Name", type: "select" },
    ];
  }
  if (category === "Sales") {
    return [
      { label: "Client Name", type: "select" },
      { label: "Project Name", type: "select" },
      { label: "Invoice Date", type: "date" },
      { label: "Sale Type", type: "select" },
    ];
  }
  if (category === "Payments") {
    return [
      { label: "Party Name", type: "select" },
      { label: "Project Name", type: "select" },
      { label: "Payment Date", type: "date" },
      { label: "Payment Type", type: "select" },
    ];
  }
  if (category === "Progress & task") {
    return [
      { label: "Project Name", type: "select" },
      { label: "Assigned To", type: "select" },
      { label: "Due Date", type: "date" },
      { label: "Status", type: "select" },
    ];
  }
  if (category === "Purchase & Expense") {
    return [
      { label: "Vendor Name", type: "select" },
      { label: "Project Name", type: "select" },
      { label: "Invoice Date", type: "date" },
    ];
  }
  if (category === "Party Balances") {
    return [
      { label: "Party Name", type: "select" },
      { label: "Party Type", type: "select" },
      { label: "Project Name", type: "select" },
    ];
  }
  if (category === "Materials & Inventory") {
    return [
      { label: "Material Name", type: "select" },
      { label: "Warehouse", type: "select" },
      { label: "Date", type: "date" },
    ];
  }
  if (category === "Library" || category === "BOQ" || category === "Budget") {
    return [
      { label: "Project Name", type: "select" },
      { label: "Category", type: "select" },
    ];
  }
  return [
    { label: "Project Name", type: "select" },
    { label: "Date", type: "date" },
  ];
}
