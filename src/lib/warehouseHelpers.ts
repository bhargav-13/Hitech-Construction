import type { StockMovement, WarehouseItem } from "./types";

export interface ItemStock {
  received: number;
  issued: number;
  returned: number;
  closing: number;
}

/** Roll up all movements for an item into current stock levels. */
export function itemStock(item: WarehouseItem, movements: StockMovement[]): ItemStock {
  let received = 0;
  let issued = 0;
  let returned = 0;
  for (const m of movements) {
    if (m.itemId !== item.id) continue;
    if (m.type === "Received") received += m.quantity;
    else if (m.type === "Issued") issued += m.quantity;
    else if (m.type === "Returned") returned += m.quantity;
  }
  const closing = item.openingStock + received - issued + returned;
  return { received, issued, returned, closing };
}

export function isLowStock(item: WarehouseItem, movements: StockMovement[]): boolean {
  return itemStock(item, movements).closing <= item.reorderLevel;
}

export function itemValue(item: WarehouseItem, movements: StockMovement[]): number {
  return Math.max(0, itemStock(item, movements).closing) * item.rate;
}
