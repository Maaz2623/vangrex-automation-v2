import { Desktop } from "@mediar-ai/terminator";

export class DesktopEngine {
  private readonly desktop: Desktop;

  constructor() {
    this.desktop = new Desktop();
  }

  async openApplication(application: string): Promise<void> {
    await this.desktop.openApplication(application, false, false);
  }

  async typeInto(selector: string, text: string): Promise<void> {
    const locator = this.desktop.locator(selector);
    const element = await locator.first(5000);

    element.typeText(text, {
      clearBeforeTyping: true,
    });
  }
}
