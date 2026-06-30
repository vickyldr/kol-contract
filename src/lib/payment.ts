// Assemble the payment-info block from method-specific fields. Per the SOP,
// only the payment section changes between bank / PayPal / Payoneer.

import type { ContractFields } from "./types";

export function buildPaymentInfo(f: ContractFields): string {
  switch (f.paymentMethod) {
    case "bank": {
      const b = f.bank;
      return [
        "Payment Method: Bank Transfer",
        b.accountName && `Account Name: ${b.accountName}`,
        b.bankName && `Bank Name: ${b.bankName}`,
        b.accountNumber && `Account Number / IBAN: ${b.accountNumber}`,
        b.swift && `SWIFT / BIC: ${b.swift}`,
        b.bankAddress && `Bank Address: ${b.bankAddress}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "paypal": {
      const p = f.paypal;
      return [
        "Payment Method: PayPal",
        p.accountName && `Account Name: ${p.accountName}`,
        p.email && `PayPal Email: ${p.email}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "payoneer": {
      const p = f.payoneer;
      return [
        "Payment Method: Payoneer",
        p.accountName && `Account Name: ${p.accountName}`,
        p.email && `Payoneer Email: ${p.email}`,
        p.customerId && `Customer ID: ${p.customerId}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
}

// Map ContractFields -> docxtemplater tag values.
export function buildTags(f: ContractFields): Record<string, string> {
  return {
    legalName: f.legalName,
    kolLink: f.kolLink,
    unitPrice: f.unitPrice,
    videoCount: f.videoCount,
    platform: f.platform,
    paymentInfo: buildPaymentInfo(f),
    paymentMethod: f.paymentMethod,
    ...f.extra,
  };
}

export function emptyFields(): ContractFields {
  return {
    legalName: "",
    kolLink: "",
    unitPrice: "",
    videoCount: "",
    platform: "",
    paymentMethod: "bank",
    bank: { accountName: "", bankName: "", accountNumber: "", swift: "", bankAddress: "" },
    paypal: { email: "", accountName: "" },
    payoneer: { email: "", accountName: "", customerId: "" },
    extra: {},
  };
}
