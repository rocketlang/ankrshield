#import <React/RCTBridgeModule.h>

RCT_EXTERN_MODULE(PermissionAuditModule, NSObject)

RCT_EXTERN_METHOD(audit:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
