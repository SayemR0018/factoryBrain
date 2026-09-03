// Centralised seed loader — builds the dataset once and exposes it to all services.
import { buildProducts } from "@/data/products";
import { buildCustomers } from "@/data/customers";
import { buildOrders } from "@/data/orders";
import { suppliers } from "@/data/suppliers";
import { buildInventory } from "@/data/inventory";
import { policies } from "@/data/policies";
import { conversations } from "@/data/conversations";
import { goals } from "@/data/goals";
import { buildGraph } from "@/data/graph";
import { buildInsights } from "@/data/insights";
import { buildActivity } from "@/data/activity";
import { agents } from "@/data/agents";
import { computeHealth } from "@/data/analytics";

const products = buildProducts(342);
const customers = buildCustomers(4218);
const { orders, byDay } = buildOrders(customers, products);
const inventory = buildInventory(products, orders);
const health = computeHealth(orders, byDay, customers, inventory);
const insights = buildInsights(health, inventory, products, customers, orders);
const graph = buildGraph(products, customers, suppliers, orders, goals);
const activity = buildActivity();

export const dataset = {
  products,
  customers,
  orders,
  byDay,
  inventory,
  suppliers,
  policies,
  conversations,
  goals,
  agents,
  health,
  insights,
  graph,
  activity
};