import assert from 'node:assert/strict';
import {expect,type Page} from '@playwright/test';
export async function checkConnectedBrowser(page:Page,base:string){
 const conversationUrl=page.url();
 const note=page.locator('[data-connected-action=note]');await note.getByLabel('Internal note',{exact:true}).fill('Browser private handoff for the leasing team.');
 await note.getByLabel('Mention teammates',{exact:true}).selectOption({label:'Journey organization_admin'});await note.getByRole('button',{name:'Add internal note',exact:true}).click();
 await expect(page.locator('[data-connected-inbox]')).toContainText('Browser private handoff');
 await page.goto(base+'/admin/attention?kind=mention&owner=mine');await expect(page.locator('[data-operations]')).toContainText('Team note for Browser Inquiry Customer');
 await page.getByRole('link',{name:'Read and acknowledge mention',exact:true}).click();await page.getByRole('button',{name:'Acknowledge mention',exact:true}).click();await expect(page.getByRole('button',{name:'Acknowledge mention',exact:true})).toHaveCount(0);
 await page.getByText('Prepare a booking invitation',{exact:true}).click();await page.getByRole('button',{name:'Prepare booking invitation',exact:true}).click();
 const editor=page.locator('[data-ops-action=draft]');await expect(editor.locator('[name=body]')).toHaveValue(/\/book#token=/);
 const bookingUrl=(await editor.locator('[name=body]').inputValue()).match(/https?:\/\/\S+\/book#token=[a-f0-9]{64}/)?.[0];assert(bookingUrl);
 await editor.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('[data-message]').first()).toContainText('/book#token=');
 await page.goto(bookingUrl);await expect(page.locator('[data-public-booking]')).toBeVisible();assert.equal(new URL(page.url()).hash,'');
 await page.locator('[data-public-booking] input[name=slot]').nth(2).check();await page.getByRole('button',{name:'Confirm viewing',exact:true}).click();await expect(page.locator('[data-booking-content]')).toContainText('Viewing status: scheduled');
 await page.getByRole('button',{name:'Choose another time',exact:true}).click();await page.locator('[data-public-booking] input[name=slot]').nth(4).check();await page.getByRole('button',{name:'Confirm new time',exact:true}).click();await expect(page.getByRole('button',{name:'Choose another time',exact:true})).toBeVisible();
 await page.getByText('Cancel this viewing',{exact:true}).click();await page.locator('[data-booking-cancel] input[name=confirmed]').check();await page.getByRole('button',{name:'Cancel viewing',exact:true}).click();await expect(page.locator('[data-booking-content]')).toContainText('Viewing status: cancelled');
 await page.goto(conversationUrl);await expect(page.locator('[data-connected-inbox]')).toContainText('cancelled');
 await page.getByText('Prepare an application invitation',{exact:true}).click();await page.getByRole('button',{name:'Prepare application invitation',exact:true}).click();
 const applicationEditor=page.locator('[data-ops-action=draft]');await expect(applicationEditor.locator('[name=body]')).toHaveValue(/\/applicant\/invite#token=/);
 await applicationEditor.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('[data-message]').first()).toContainText('/applicant/invite#token=');
 await expect(page.locator('[data-connected-error]')).toBeEmpty();
 console.log('PASS browser connected: private note and mention, attention navigation, inbox booking invitation, prospect reschedule/cancel and application invitation draft');
}
