import { expect, test } from "@playwright/test";

test("홈 화면이 열리고 주유소 찾기 제목이 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("근처 최저가 주유소");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "근처 최저가 주유소"
  );
});
