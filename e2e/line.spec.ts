import { messages } from '../src/i18n.ts';
import { en, expect, mirrorOf, newLink, test } from './fixtures.ts';

test('two people mirror each other’s typing, newlines included', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('hello');
	await a.locator('#composer').press('Shift+Enter');
	await a.locator('#composer').pressSequentially('world');
	await expect.poll(mirrorOf(b)).toBe('hello\nworld');
	await b.locator('#composer').pressSequentially('hi');
	await expect.poll(mirrorOf(a)).toBe('hi');
});

test('Enter erases your field and the partner’s mirror of it', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('abc');
	await expect.poll(mirrorOf(b)).toBe('abc');
	await a.locator('#composer').press('Enter');
	await expect(a.locator('#composer')).toHaveValue('');
	await expect.poll(mirrorOf(b)).toBe('');
});

test('the Erase button erases', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('abc');
	await expect.poll(mirrorOf(b)).toBe('abc');
	await a.click('#erase');
	await expect(a.locator('#composer')).toHaveValue('');
	await expect.poll(mirrorOf(b)).toBe('');
});

test('in Ctrl+Enter mode, Enter is a newline and Ctrl+Enter erases', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.click('[data-send-key="ctrlEnter"]');
	await expect(a.locator('.hint')).toHaveText(en.hintCtrlEnter);
	await a.locator('#composer').pressSequentially('one');
	await a.locator('#composer').press('Enter');
	await a.locator('#composer').pressSequentially('two');
	await expect.poll(mirrorOf(b)).toBe('one\ntwo');
	await a.locator('#composer').press('Control+Enter');
	await expect(a.locator('#composer')).toHaveValue('');
	await expect.poll(mirrorOf(b)).toBe('');
});

test('the erase-key preference survives a reload', async ({ page }) => {
	await page.goto(newLink());
	await page.click('[data-send-key="ctrlEnter"]');
	await page.reload();
	await expect(page.locator('[data-send-key="ctrlEnter"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.hint')).toHaveText(en.hintCtrlEnter);
});

test('when one side leaves, the other’s mirror blanks and says so', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await a.locator('#composer').pressSequentially('bye');
	await expect.poll(mirrorOf(b)).toBe('bye');
	await a.context().close();
	await expect(b.locator('.status-text')).toHaveText(en.statusLeft, { timeout: 10_000 });
	await expect.poll(mirrorOf(b)).toBe('');
	await expect(b.locator('.invite')).toBeVisible();
});

test('reopening the link resyncs the mirrors', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	await b.locator('#composer').pressSequentially('still here');
	await expect.poll(mirrorOf(a)).toBe('still here');
	await a.reload();
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	await expect.poll(mirrorOf(a)).toBe('still here');
	await a.locator('#composer').pressSequentially('back');
	await expect.poll(mirrorOf(b)).toBe('back');
});

test('a third person finds the line busy', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	await expect(b.locator('.status-text')).toHaveText(en.statusConnected);
	const c = await join(link);
	await expect(c.locator('.status-text')).toHaveText(en.statusBusy);
	await expect(c.locator('#retry')).toBeVisible();
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
});

test('the title marks a connected call', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusWaiting);
	await expect(a).toHaveTitle(en.appTitle);
	await join(link);
	await expect(a).toHaveTitle(`● ${en.appTitle}`);
});

test('switching language relabels the line without dropping the call', async ({ join }) => {
	const link = newLink();
	const a = await join(link);
	const b = await join(link);
	await expect(a.locator('.status-text')).toHaveText(en.statusConnected);
	await a.click('button.lang[data-lang="ru"]');
	await expect(a.locator('html')).toHaveAttribute('lang', 'ru');
	await expect(a.locator('.status-text')).toHaveText(messages.ru.statusConnected);
	await expect(a.locator('#erase')).toHaveText(messages.ru.erase);
	await a.locator('#composer').pressSequentially('still on');
	await expect.poll(mirrorOf(b)).toBe('still on');
});
