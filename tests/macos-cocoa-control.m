// Attribution control: Cocoa only, with no Cue or Tauri implementation.
#import <Cocoa/Cocoa.h>
int main(void) {
  @autoreleasepool {
    NSApplication *app = [NSApplication sharedApplication];
    [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    NSWindow *window = [[NSWindow alloc]
      initWithContentRect:NSMakeRect(100, 100, 640, 480)
      styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
      backing:NSBackingStoreBuffered defer:NO];
    [window setTitle:@"Cue memory control"];
    [window makeKeyAndOrderFront:nil];
    [app run];
  }
  return 0;
}
