#import <React/RCTBridgeModule.h>

// Note: Swift class is "iOSHealthModule" but ObjC name is "IOSHealthModule"
RCT_EXTERN_MODULE(IOSHealthModule, NSObject)

RCT_EXTERN_METHOD(getHealthReport:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
