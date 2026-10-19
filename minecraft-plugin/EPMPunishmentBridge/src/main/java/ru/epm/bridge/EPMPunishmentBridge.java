package ru.epm.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.bukkit.Bukkit;
import org.bukkit.command.CommandSender;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.server.ServerCommandEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

public final class EPMPunishmentBridge extends JavaPlugin implements Listener {
    private String apiUrl, apiKey, mode;
    private long delay, rewardPollTicks;
    private final Set<String> commands = new HashSet<String>();
    private final Set<String> sent = ConcurrentHashMap.newKeySet();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadConfig();
        apiUrl = getConfig().getString("api-url", "https://epmofficial.onrender.com").replaceAll("/+$", "");
        apiKey = getConfig().getString("api-key", "");
        mode = getConfig().getString("mode", "Estamon Grief");
        delay = Math.max(1, getConfig().getLong("send-delay-ticks", 20));
        rewardPollTicks = Math.max(20, getConfig().getLong("reward-poll-ticks", 100));

        commands.clear();
        for (String c : getConfig().getStringList("commands")) {
            commands.add(c.toLowerCase(Locale.ROOT));
        }

        Bukkit.getPluginManager().registerEvents(this, this);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, new Runnable() {
            @Override public void run() { pollRewards(); }
        }, 40L, rewardPollTicks);
        getLogger().info("EPM punishment/reward bridge enabled: " + mode);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerCommand(PlayerCommandPreprocessEvent e) {
        Parsed p = parse(e.getMessage(), e.getPlayer());
        if (p != null) queue(p);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onServerCommand(ServerCommandEvent e) {
        Parsed p = parse("/" + e.getCommand(), e.getSender());
        if (p != null) queue(p);
    }

    private void queue(final Parsed p) {
        Bukkit.getScheduler().runTaskLaterAsynchronously(this, new Runnable() {
            @Override
            public void run() {
                send(p);
            }
        }, delay);
    }

    private Parsed parse(String raw, CommandSender sender) {
        if (raw == null) return null;

        String line = raw.trim();
        if (line.startsWith("/")) line = line.substring(1);

        String[] a = line.split("\\s+");
        if (a.length < 2) return null;

        String command = a[0].toLowerCase(Locale.ROOT);
        int colon = command.lastIndexOf(':');
        if (colon >= 0) command = command.substring(colon + 1);
        if (!commands.contains(command)) return null;

        String target = a[1];
        if (target.length() < 1 || target.length() > 24 || target.contains(":")) return null;

        boolean unban = command.equals("unban") || command.equals("pardon") || command.equals("unbanip") || command.equals("pardonip");
        boolean temp = command.equals("tempban") || command.equals("tempbanip");
        int reasonStart = 2;
        Date expires = null;

        if (temp && a.length >= 3) {
            expires = parseDuration(a[2]);
            reasonStart = 3;
        }

        StringBuilder reason = new StringBuilder();
        for (int i = reasonStart; i < a.length; i++) {
            if (reason.length() > 0) reason.append(' ');
            reason.append(a[i]);
        }

        String moderator = sender == null ? "Unknown" : sender.getName();
        if (moderator == null || moderator.trim().isEmpty()) moderator = "CONSOLE";

        Parsed p = new Parsed();
        p.nickname = target;
        p.type = unban ? "UNBAN" : "BAN";
        p.reason = reason.length() == 0 ? (unban ? "Разблокировка на сервере" : "Не указана") : reason.toString();
        p.moderator = moderator;
        p.expires = expires;
        p.raw = line;
        return p;
    }

    private Date parseDuration(String s) {
        if (s == null) return null;

        String v = s.toLowerCase(Locale.ROOT).trim();
        if (v.equals("perm") || v.equals("permanent") || v.equals("forever")) return null;

        try {
            long n = Long.parseLong(v.substring(0, v.length() - 1));
            char u = v.charAt(v.length() - 1);
            long ms;

            if (u == 's') ms = n * 1000L;
            else if (u == 'm') ms = n * 60_000L;
            else if (u == 'h') ms = n * 3_600_000L;
            else if (u == 'd') ms = n * 86_400_000L;
            else if (u == 'w') ms = n * 604_800_000L;
            else if (u == 'y') ms = n * 31_536_000_000L;
            else return null;

            return new Date(System.currentTimeMillis() + ms);
        } catch (Exception ignored) {
            return null;
        }
    }


    private void pollRewards() {
        HttpURLConnection con = null;
        try {
            if (apiKey == null || apiKey.trim().isEmpty() || apiKey.equals("PUT_SERVER_KEY_HERE")) return;
            String encodedMode = java.net.URLEncoder.encode(mode, "UTF-8");
            URL url = new URL(apiUrl + "/api/integrations/battlepass/rewards?mode=" + encodedMode);
            con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("GET");
            con.setConnectTimeout(7000);
            con.setReadTimeout(7000);
            con.setRequestProperty("X-EPM-API-Key", apiKey);
            int code = con.getResponseCode();
            if (code < 200 || code >= 300) {
                getLogger().warning("Battle Pass queue returned HTTP " + code);
                return;
            }
            JsonObject root = new JsonParser().parse(read(con.getInputStream())).getAsJsonObject();
            JsonArray jobs = root.has("jobs") ? root.getAsJsonArray("jobs") : new JsonArray();
            for (JsonElement element : jobs) {
                if (!element.isJsonObject()) continue;
                final JsonObject job = element.getAsJsonObject();
                final long id = job.get("id").getAsLong();
                final String nickname = job.get("nickname").getAsString();
                final String rewardType = job.get("reward_type").getAsString();
                final JsonObject payload = job.getAsJsonObject("payload");
                Bukkit.getScheduler().runTask(this, new Runnable() {
                    @Override public void run() {
                        String error = executeReward(nickname, rewardType, payload);
                        final String result = error == null ? "delivered" : "failed";
                        final String message = error == null ? "" : error;
                        Bukkit.getScheduler().runTaskAsynchronously(EPMPunishmentBridge.this, new Runnable() {
                            @Override public void run() { acknowledgeReward(id, result, message); }
                        });
                    }
                });
            }
        } catch (Exception ex) {
            getLogger().warning("Battle Pass queue poll failed: " + ex.getMessage());
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private String executeReward(String nickname, String type, JsonObject payload) {
        if (nickname == null || !nickname.matches("[A-Za-z0-9_]{3,24}")) return "Invalid player nickname";
        if (payload == null) return "Reward payload is missing";
        if ("currency".equals(type)) {
            int amount = payload.has("amount") ? payload.get("amount").getAsInt() : 0;
            if (amount < 1 || amount > 100000000) return "Invalid currency amount";
            String template = getConfig().getString("reward-commands.currency", "").trim();
            if (template.isEmpty()) return "Currency command is not configured";
            return dispatchRewardCommand(template.replace("{player}", nickname).replace("{amount}", String.valueOf(amount)));
        }
        if ("privilege".equals(type)) {
            String key = payload.has("group") ? payload.get("group").getAsString() : "";
            String group = getConfig().getString("privilege-groups." + key, "").trim();
            String template = getConfig().getString("reward-commands.privilege", "").trim();
            if (group.isEmpty() || template.isEmpty()) return "Privilege group/command is not configured: " + key;
            if (!group.matches("[A-Za-z0-9_-]{1,32}")) return "Invalid configured privilege group";
            return dispatchRewardCommand(template.replace("{player}", nickname).replace("{group}", group));
        }
        if ("item".equals(type)) {
            JsonArray items = payload.has("items") ? payload.getAsJsonArray("items") : new JsonArray();
            String template = getConfig().getString("reward-commands.item", "give {player} {item} {amount}").trim();
            if (items.size() == 0 || template.isEmpty()) return "Item reward/command is not configured";
            for (JsonElement element : items) {
                if (!element.isJsonObject()) return "Invalid item payload";
                JsonObject item = element.getAsJsonObject();
                String material = item.has("item") ? item.get("item").getAsString().toLowerCase(Locale.ROOT) : "";
                int amount = item.has("amount") ? item.get("amount").getAsInt() : 0;
                if (!material.matches("[a-z0-9_:.]{1,64}") || amount < 1 || amount > 2304) return "Invalid item or amount";
                String error = dispatchRewardCommand(template.replace("{player}", nickname).replace("{item}", material).replace("{amount}", String.valueOf(amount)));
                if (error != null) return error;
            }
            return null;
        }
        return "Unsupported reward type: " + type;
    }

    private String dispatchRewardCommand(String command) {
        if (command == null || command.trim().isEmpty() || command.contains("{")) return "Reward command template is incomplete";
        boolean accepted = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
        return accepted ? null : "Minecraft rejected command: " + command.split("\\s+")[0];
    }

    private void acknowledgeReward(long id, String status, String message) {
        HttpURLConnection con = null;
        try {
            URL url = new URL(apiUrl + "/api/integrations/battlepass/rewards/" + id + "/complete");
            con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(7000);
            con.setReadTimeout(7000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            con.setRequestProperty("X-EPM-API-Key", apiKey);
            String body = "{\"mode\":\"" + json(mode) + "\",\"status\":\"" + json(status) + "\",\"message\":\"" + json(message) + "\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            con.setFixedLengthStreamingMode(bytes.length);
            OutputStream out = con.getOutputStream();
            out.write(bytes);
            out.close();
            int code = con.getResponseCode();
            if (code < 200 || code >= 300) getLogger().warning("Battle Pass acknowledgement returned HTTP " + code + ": " + read(con.getErrorStream()));
        } catch (Exception ex) {
            getLogger().warning("Battle Pass acknowledgement failed for job " + id + ": " + ex.getMessage());
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private void send(Parsed p) {
        String externalId = sha256(
            mode + "|" + p.nickname + "|" + p.moderator + "|" + p.raw + "|" +
            (p.expires == null ? "" : p.expires.getTime())
        );

        if (sent.contains(externalId)) return;

        String expires = p.expires == null ? null : iso(p.expires);

        StringBuilder payload = new StringBuilder();
        payload.append("{");
        payload.append("\"nickname\":\"").append(json(p.nickname)).append("\",");
        payload.append("\"reason\":\"").append(json(p.reason)).append("\",");
        payload.append("\"moderator\":\"").append(json(p.moderator)).append("\",");
        payload.append("\"expiresAt\":");
        if (expires == null) {
            payload.append("null");
        } else {
            payload.append("\"").append(json(expires)).append("\"");
        }
        payload.append(",");
        payload.append("\"mode\":\"").append(json(mode)).append("\",");
        payload.append("\"type\":\"").append(json(p.type)).append("\",");
        payload.append("\"server\":\"").append(json(mode)).append("\",");
        payload.append("\"externalId\":\"").append("UNBAN".equals(p.type) ? "" : externalId).append("\"");
        payload.append("}");

        HttpURLConnection con = null;

        try {
            if (apiKey == null || apiKey.trim().isEmpty() || apiKey.equals("PUT_SERVER_KEY_HERE")) {
                getLogger().warning("EPM API key is not configured.");
                return;
            }

            URL url = new URL(apiUrl + "/api/integrations/punishments");
            con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            con.setRequestProperty("X-EPM-API-Key", apiKey);

            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            con.setFixedLengthStreamingMode(body.length);

            OutputStream out = con.getOutputStream();
            out.write(body);
            out.close();

            int code = con.getResponseCode();

            if (code >= 200 && code < 300) {
                sent.add(externalId);
                getLogger().info("Synced ban: " + p.nickname + " -> " + mode);
            } else {
                getLogger().warning("EPM API returned HTTP " + code + ": " + read(con.getErrorStream()));
            }
        } catch (Exception ex) {
            getLogger().warning("EPM sync failed: " + ex.getMessage());
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String json(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    private static String iso(Date d) {
        SimpleDateFormat f = new SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT
        );
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(d);
    }

    private static String read(InputStream in) {
        if (in == null) return "";
        try {
            BufferedReader r = new BufferedReader(
                new InputStreamReader(in, StandardCharsets.UTF_8)
            );
            StringBuilder b = new StringBuilder();
            String x;
            while ((x = r.readLine()) != null) b.append(x);
            return b.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String sha256(String s) {
        try {
            MessageDigest m = MessageDigest.getInstance("SHA-256");
            byte[] b = m.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder x = new StringBuilder();
            for (byte q : b) x.append(String.format("%02x", q));
            return x.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }

    private static final class Parsed {
        String nickname, reason, moderator, raw, type;
        Date expires;
    }
}
