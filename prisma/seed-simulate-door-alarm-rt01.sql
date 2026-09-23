-- ============================================================================
-- Simulasi ALARM pintu untuk RT 01 (Tenant 00000000-0000-0000-0000-000000000011)
--
-- Membuat kondisi "alerting" yang PASTI terlihat kapan pun dashboard dibuka:
-- pintu 'open' + monitoring aktif + window 24 jam (00:00-23:59) sehingga waktu
-- sekarang selalu berada di dalam window.
--
-- Jalankan: node scripts/run-migration.mjs prisma/seed-simulate-door-alarm-rt01.sql
-- ============================================================================

-- Rumah C2 (household a109 / config e0005): jadikan alarm aktif 24 jam.
UPDATE door_sensor_configs
SET current_state    = 'open',
    enabled          = TRUE,
    monitor_start    = '00:00',
    monitor_end      = '23:59',
    last_state_change = NOW(),
    updated_at       = NOW()
WHERE id = '00000000-0000-0000-0000-0000000e0005';

-- Rumah A2 (household a102 / config e0002): alarm aktif kedua, window malam
-- lebar (18:00-08:00) agar juga alerting pada malam/pagi hari.
UPDATE door_sensor_configs
SET current_state    = 'open',
    enabled          = TRUE,
    monitor_start    = '18:00',
    monitor_end      = '08:00',
    last_state_change = NOW(),
    updated_at       = NOW()
WHERE id = '00000000-0000-0000-0000-0000000e0002';

-- Verifikasi: tampilkan kondisi tiap sensor RT 01.
SELECT household_id, current_state, enabled, monitor_start, monitor_end
FROM door_sensor_configs
WHERE tenant_id = '00000000-0000-0000-0000-000000000011'
ORDER BY household_id;
