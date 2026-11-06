import {expect} from '@playwright/test';
import {translate} from '../src/lib/i18n.js';
export async function selectDeliveryPlace(page,key,query,name,language='en'){
 await page.getByPlaceholder(translate(key==='pickup'?'Pickup address':'Destination address',language),{exact:true}).fill(query);
 await page.getByRole('option').filter({hasText:name}).first().click();
}
export async function openDeliveryPackage(page,language='en'){
 const button=page.locator('form').getByRole('button',{name:translate('Continue',language),exact:true});await expect(button).toBeEnabled({timeout:30000});await button.click();await expect(page.getByRole('dialog',{name:translate('Package Details',language)})).toBeVisible();
}
export async function deliveryReview(page,language='en',vehicle='economy'){
 await page.locator('form').getByRole('button',{name:translate('Continue',language),exact:true}).click();
 const choice=page.locator('.delivery-vehicle-option').filter({hasText:translate(vehicle[0].toUpperCase()+vehicle.slice(1),language)});await expect(choice).toBeVisible({timeout:45000});await choice.click();
 const proceed=page.locator('form').getByRole('button',{name:translate('Continue',language),exact:true});await expect(proceed).toBeEnabled({timeout:45000});await proceed.click();await expect(page.getByRole('button',{name:translate('Confirm Delivery',language),exact:true})).toBeEnabled();
}
