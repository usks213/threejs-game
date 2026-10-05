import {expect,it,vi} from 'vitest';
import {commitPowerPreview,powerPreviewConnectionReady} from '../../src/ui/power-preview-commit';
it('retains an unsubmitted move during resync, sends once after explicit reconfirmation, and never auto-queues it',()=>{
 const original={action:'sky-move',id:'1',target:{x:1,y:2,z:4}},send=vi.fn();let draft:typeof original|undefined=original;
 draft=commitPowerPreview(draft,powerPreviewConnectionReady('syncing','guest'),send);expect(draft).toBe(original);expect(send).not.toHaveBeenCalled();
 expect(powerPreviewConnectionReady('online','guest')).toBe(true);expect(send).not.toHaveBeenCalled();
 draft=commitPowerPreview(draft,true,send);expect(draft).toBeUndefined();expect(send).toHaveBeenCalledExactlyOnceWith(original);commitPowerPreview(draft,true,send);expect(send).toHaveBeenCalledTimes(1);
});
it('allows local/online commits but refuses connecting, reconnecting and closed guest states',()=>{
 for(const connection of['connecting','syncing','reconnecting'])expect(powerPreviewConnectionReady(connection,'guest')).toBe(false);
 expect(powerPreviewConnectionReady('closed','guest')).toBe(false);expect(powerPreviewConnectionReady('closed',undefined)).toBe(true);expect(powerPreviewConnectionReady(undefined,undefined)).toBe(true);expect(powerPreviewConnectionReady('online','guest')).toBe(true);
});
