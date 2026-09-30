import { z } from 'zod';
import { isoDate } from '../../common.js';

/** Dining halls with the `locationNum` the site's menu page takes. */
export const DINING_HALLS = {
  'South Campus': 16,
  'Yahentamitsi Dining Hall': 19,
  '251 North': 51,
} as const;

export type DiningHall = keyof typeof DINING_HALLS;

export const diningHall = z
  .enum(Object.keys(DINING_HALLS) as DiningHall[])
  .describe('Dining hall to get the menu for');

export const menuDate = isoDate
  .optional()
  .describe(
    'Day to get the menu for, as YYYY-MM-DD (default: today). Menus are posted about a week ahead.',
  );

export const recipeId = z
  .string()
  .trim()
  .regex(/^\d+\*\d+$/, 'Expected a recipe id like 060064*2')
  .describe('Recipe identifier from a menu item, e.g. "060064*2"');

export const menuItemSchema = z.object({
  name: z.string().describe('Name of the dish, e.g. "Pancakes Plain"'),
  id: z
    .string()
    .describe(
      'Recipe identifier, e.g. "060064*2"; pass it to nutrition_get_recipe for the nutrition label',
    ),
  allergens: z
    .array(z.string())
    .describe(
      'Allergens the dish contains, e.g. "dairy", "gluten", "nuts", "sesame", "pork", "alcohol"',
    ),
  labels: z
    .array(z.string())
    .describe('Dietary labels for the dish, e.g. "vegetarian", "vegan", "halal friendly"'),
});

export const stationSchema = z.object({
  name: z.string().describe('Name of the station or section, e.g. "Broiler Works" or "Salad Bar"'),
  items: z.array(menuItemSchema).describe('Dishes served at this station'),
});

export const mealSchema = z.object({
  name: z
    .string()
    .describe(
      'Meal period: "Breakfast", "Lunch" or "Dinner" on weekdays, "Brunch" or "Dinner" on weekends (depending on the dining hall)',
    ),
  stations: z
    .array(stationSchema)
    .describe('Stations serving during this meal period, in the order the site lists them'),
});

export const nutrientSchema = z.object({
  name: z
    .string()
    .describe(
      'Nutrient as printed on the label, e.g. "Total Fat", "Saturated Fat", "Sodium", "Vitamin C"',
    ),
  amount: z
    .number()
    .nullable()
    .describe('Amount per serving, in `unit`; null if the label does not report it'),
  unit: z.string().describe('Unit of `amount`: "g", "mg" or "mcg"'),
  daily_value: z
    .number()
    .int()
    .nullable()
    .describe(
      'Percent of the recommended daily value, based on a 2,000-calorie diet; null if the label does not give one',
    ),
});

export const recipeSchema = z.object({
  id: z.string().describe('Recipe identifier, e.g. "060064*2"'),
  name: z.string().describe('Name of the dish, e.g. "Bacon"'),
  serving_size: z.string().describe('Serving size as printed, e.g. "2 ea" or "4 oz"'),
  calories: z.number().int().describe('Calories per serving'),
  nutrients: z
    .array(nutrientSchema)
    .describe('Nutrition facts per serving, in the order the label lists them'),
  ingredients: z
    .array(z.string())
    .describe(
      'Ingredients in order of predominance, each keeping its sub-ingredients in parentheses, e.g. "Tofu (Water, Soybeans, Calcium Sulfate)"',
    ),
  allergens: z
    .array(z.string())
    .describe('Allergens the label declares, e.g. "gluten", "soybeans", "sesame"; empty if none'),
});

export type MenuItem = z.infer<typeof menuItemSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Meal = z.infer<typeof mealSchema>;
export type Nutrient = z.infer<typeof nutrientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
