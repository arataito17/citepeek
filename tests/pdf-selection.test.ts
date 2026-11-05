import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nearestTextBox,selectionColumn} from '../lib/pdf-selection';
const boxes=[
 {name:'header',left:10,right:150,top:0,bottom:10},
 {name:'first line',left:10,right:150,top:30,bottom:40},
 {name:'second line',left:10,right:100,top:45,bottom:55},
 {name:'other column',left:200,right:350,top:30,bottom:40},
];
test('a drag in a line gap stays near the body instead of jumping to the header',()=>{
 assert.equal(nearestTextBox(boxes,60,42)?.name,'first line');
 assert.equal(nearestTextBox(boxes,60,44)?.name,'second line');
});
test('blank space after a short line selects its end, not a different wrapped line',()=>{
 assert.equal(nearestTextBox(boxes,145,50)?.name,'second line');
});
test('the visual column is resolved by pointer position rather than DOM order',()=>{
 assert.equal(nearestTextBox(boxes,205,35)?.name,'other column');
 assert.equal(nearestTextBox([...boxes].reverse(),145,35)?.name,'first line');
});
test('empty text layers have no selection endpoint',()=>{assert.equal(nearestTextBox([],0,0),undefined);});
test('trailing whitespace of a short line stays in the current column',()=>{
 const runs=[{left:10,right:100,top:45,bottom:55},{left:200,right:350,top:45,bottom:55}];
 assert.equal(nearestTextBox(runs,170,50,60),runs[0]);
 assert.equal(nearestTextBox(runs,205,50,60),runs[1]);
});
test('starting a reverse drag in blank space uses the surrounding column width',()=>{
 const runs=[{left:10,right:150,top:30,bottom:40},{left:10,right:90,top:45,bottom:55},{left:180,right:320,top:45,bottom:55}];
 const column=selectionColumn(runs,145,50,350);
 assert.equal(column,80);
 assert.equal(nearestTextBox(runs,145,50,column),runs[1]);
});
