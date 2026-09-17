import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Suya static menu delivery contract', () => {
  it('loads the ESM entrypoint and renders QR locally', () => {
    const index = source('apps/menu/index.html');
    const app = source('apps/menu/app.js');
    const styles = source('apps/menu/styles.css');

    expect(index).toContain('<script src="qrcode-generator.js"></script><script type="module" src="app.js"></script>');
    expect(index).toContain('<link rel="icon" href="favicon.svg" type="image/svg+xml">');
    expect(index).toContain('<div id="qrCode" class="qr-code" role="img"');
    expect(app).toContain("typeof window.qrcode");
    expect(app).toContain('renderQr(publicUrl)');
    expect(app).toContain("$('#colorInput').value=safeHexColor");
    expect(app).toContain("$('#fontInput').value=['DM Sans','Manrope','Plus Jakarta Sans']");
    expect(app).not.toContain('api.qrserver.com');
    expect(styles).not.toMatch(/@import|https?:\/\//iu);
  });

  it('uses bearer authentication without cookies when the API is configured', () => {
    const app = source('apps/menu/app.js');

    expect(app).toContain("credentials:'omit'");
    expect(app).toContain('Authorization');
    expect(app).not.toContain("credentials:'include'");
    expect(app).toContain("sessionStorage.setItem(AUTH_TOKEN_KEY,authToken)");
  });

  it('does not expose a previous local menu when the configured API fails', () => {
    const app = source('apps/menu/app.js');

    expect(app).toContain('function clearMenuState()');
    expect(app).toContain('if(!API)loadLocalState();');
    expect(app).toContain('if(API)clearMenuState();');
    expect(app).toContain("const local=JSON.parse(localStorage.getItem('suya-menu-state')||'null')");
    expect(app).toContain('catch{clearMenuState()}');
  });
});
