import { z } from 'zod';
import { Integration, tool } from '../base.js';
import { parseMenu, parseRecipe, toSiteDate } from './parsers.js';
import {
  DINING_HALLS,
  type DiningHall,
  diningHall,
  type Meal,
  mealSchema,
  menuDate,
  type Recipe,
  recipeId,
  recipeSchema,
} from './schemas.js';

export class Nutrition extends Integration {
  readonly name = 'nutrition';
  readonly baseUrl = 'https://nutrition.umd.edu';

  @tool({
    title: 'Get a dining hall menu',
    description:
      'What a UMD dining hall is serving on a given day, by meal period and station, with allergens and dietary labels for each dish, from nutrition.umd.edu. No login needed.',
    input: { hall: diningHall, date: menuDate },
    output: {
      meals: z
        .array(mealSchema)
        .describe(
          'Meal periods served that day, in order; empty if no menu is posted for that date',
        ),
    },
  })
  async get_menu({
    hall,
    date,
  }: {
    hall: DiningHall;
    date?: string | undefined;
  }): Promise<{ meals: Meal[] }> {
    const html = await this.getText('', {
      locationNum: DINING_HALLS[hall],
      dtdate: date === undefined ? undefined : toSiteDate(date),
    });
    return { meals: parseMenu(html) };
  }

  @tool({
    title: "Get a recipe's nutrition label",
    description:
      'The nutrition label for a dish on a UMD dining hall menu: serving size, calories, nutrition facts with daily values, ingredients and allergens. Use the id from nutrition_get_menu. No login needed.',
    input: { id: recipeId },
    output: recipeSchema.shape,
  })
  async get_recipe({ id }: { id: string }): Promise<Recipe> {
    const html = await this.getText('label.aspx', { RecNumAndPort: id });
    const recipe = parseRecipe(html, id);
    if (recipe === undefined) throw new Error(`${this.name}: no recipe with id "${id}"`);
    return recipe;
  }
}
