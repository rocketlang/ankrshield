package com.ankr.shield;

import androidx.annotation.NonNull;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

public class DeviceHealthPackage implements ReactPackage {
    @NonNull @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext ctx) {
        return Collections.singletonList(new DeviceHealthModule(ctx));
    }
    @NonNull @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext ctx) {
        return Collections.emptyList();
    }
}
