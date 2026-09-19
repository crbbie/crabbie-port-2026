import assert from 'node:assert/strict';
import { mapPortfolioProject } from './portfolio-cms-core.js';
import { mapFreeAsset } from './free-assets-core.js';
import { mapCommissionService } from './commissions-core.js';
import { mapCmsPage, mapNavigationItem, mapSiteSettings } from './site-content-core.js';

const portfolio = mapPortfolioProject({slug:'color-fiesta',title:'DB title',description:'',tags:[],thumbnail_path:null,cover_path:'',content:{cat:'',blocks:[]}}, {thumbnail:'old.png',cover:'old-cover.png',cat:'Old',blocks:[{type:'text',text:'old'}]});
assert.equal(portfolio.thumbnail, '');
assert.equal(portfolio.cover, '');
assert.equal(portfolio.cat, '');
assert.deepEqual(portfolio.blocks, []);

const asset = mapFreeAsset({slug:'sample',title:'DB',description:'',thumbnail_path:null,file_type:'',file_path:'',availability:'unavailable',metadata:{cat:'',version:'',date:'',credit:'',license:'',update:'',tags:[]}}, {thumbnail:'old.png',downloadUrl:'https://example.test/old.zip',cat:'Old',version:'old',tags:['OLD']});
assert.equal(asset.thumbnail, '');
assert.equal(asset.downloadUrl, '');
assert.equal(asset.version, '');
assert.deepEqual(asset.tags, []);

const commission = mapCommissionService({slug:'sample',title:'DB',description:'',price:0,currency:'USD',availability:'closed',form_slug:'',thumbnail_path:null,details:{priceFormatted:'',deliveryEstimate:'',chips:[],isOtherService:true}}, {thumbnail:'old.png',deliveryEstimate:'old',chips:['OLD']});
assert.equal(commission.thumbnail, '');
assert.equal(commission.deliveryEstimate, '');
assert.deepEqual(commission.chips, []);

const about = mapCmsPage({slug:'about',title:'',content:'',published:true,data:{name:'',links:[]}}, {title:'Old',content:'Old',links:[{url:'https://example.test'}]});
assert.equal(about.title, '');
assert.equal(about.content, '');
assert.deepEqual(about.links, []);
assert.equal(mapNavigationItem({id:'1',title:'',url:'',published:false,sort_order:0},{title:'Old',url:'#home'}).title, '');
assert.deepEqual(mapSiteSettings([{key:'branding',value:{title:''}}],{branding:{title:'Old'}}).branding,{title:''});
console.log('Public CMS authoritative mapping regressions passed.');
