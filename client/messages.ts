import { defineTranslations } from "@getpaseo/plugin/client";
import en from "./locales/en.json";
import ja from "./locales/ja.json";

export const messages = defineTranslations({ resources: { en, ja } });
