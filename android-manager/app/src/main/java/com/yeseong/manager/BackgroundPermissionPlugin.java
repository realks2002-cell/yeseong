package com.yeseong.manager;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 위치 "항상 허용"(ACCESS_BACKGROUND_LOCATION) 권한 플러그인.
 * JS에서 registerPlugin('BackgroundPermission')으로 사용한다.
 *
 * Android OS 규칙:
 * - 백그라운드 권한은 포그라운드 권한 허용 후에만 요청 가능 (동시 요청 시 무조건 거부)
 * - API < 29: 백그라운드 개념 없음 (포그라운드 = 항상 허용)
 * - API == 29: requestPermissions 다이얼로그로 요청 가능
 * - API >= 30: 다이얼로그 불가 — 앱 설정 화면으로 보내 사용자가 직접 선택
 */
@CapacitorPlugin(name = "BackgroundPermission")
public class BackgroundPermissionPlugin extends Plugin {

    private static final int REQ_BACKGROUND = 9001;

    private boolean has(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** 하위 호환 — 기존 JS(check)가 쓰는 메서드 */
    @PluginMethod
    public void check(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            granted = has(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
        } else {
            granted = has(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    /** 현재 상태: denied | whenInUse | always */
    @PluginMethod
    public void getLocationAuthorizationStatus(PluginCall call) {
        boolean fine = has(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = has(Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean background = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            background = has(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
        }
        String status;
        if (!fine && !coarse) status = "denied";
        else if (background) status = "always";
        else status = "whenInUse";
        JSObject ret = new JSObject();
        ret.put("status", status);
        call.resolve(ret);
    }

    /**
     * 백그라운드 위치 권한 요청 — 반드시 사용자의 명시적 버튼 탭에서만 호출할 것.
     * (자동 트리거에서 호출 시 권한 다이얼로그 ↔ appStateChange 무한 루프 → ANR)
     */
    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        boolean fine = has(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = has(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (!fine && !coarse) {
            call.reject("포그라운드 위치 권한이 먼저 필요합니다");
            return;
        }

        JSObject ret = new JSObject();

        // API < 29: 백그라운드 개념 없음 — 포그라운드 = 항상 허용
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (has(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) {
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        // API == 29: 다이얼로그 요청 가능 ("항상 허용" 옵션 표시)
        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                    REQ_BACKGROUND
            );
            ret.put("granted", false);
            ret.put("requested", true);
            call.resolve(ret);
            return;
        }

        // API >= 30: 다이얼로그 불가 — 앱 상세 설정으로 이동
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        ret.put("granted", false);
        ret.put("settingsOpened", true);
        call.resolve(ret);
    }
}
