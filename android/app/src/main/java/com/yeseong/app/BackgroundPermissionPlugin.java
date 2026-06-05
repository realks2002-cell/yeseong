package com.yeseong.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 위치 "항상 허용"(ACCESS_BACKGROUND_LOCATION) 권한 상태 확인 플러그인.
 * JS에서 registerPlugin('BackgroundPermission')으로 사용한다.
 */
@CapacitorPlugin(name = "BackgroundPermission")
public class BackgroundPermissionPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ : 백그라운드 위치 권한이 곧 "항상 허용"
            granted = ContextCompat.checkSelfPermission(
                    getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
        } else {
            // Android 9 이하 : 위치 권한 자체가 항상 허용과 동일
            granted = ContextCompat.checkSelfPermission(
                    getContext(), Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }
}
