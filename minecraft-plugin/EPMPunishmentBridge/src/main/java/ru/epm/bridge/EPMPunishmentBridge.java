package ru.epm.bridge;

import org.bukkit.BanEntry;
import org.bukkit.BanList;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

public final class EPMPunishmentBridge extends JavaPlugin implements Listener {
    private String apiUrl, apiKey, mode;
    private long delay;
    private final Set<String> commands = new HashSet<String>();
    private final Set<String> sent = ConcurrentHashMap.newKeySet();

    @Override public void onEnable() {
        saveDefaultConfig();
        reloadConfig();
        apiUrl=getConfig().getString("api-url","https://epmofficial.onrender.com").replaceAll("/+$","");
        apiKey=getConfig().getString("api-key","");
        mode=getConfig().getString("mode","Estamon Grief");
        delay=Math.max(1,getConfig().getLong("send-delay-ticks",20));
        commands.clear();
        for(String c:getConfig().getStringList("commands")) commands.add(c.toLowerCase(Locale.ROOT));
        Bukkit.getPluginManager().registerEvents(this,this);
        getLogger().info("EPM punishment bridge enabled: "+mode);
    }

    @EventHandler(priority=EventPriority.MONITOR, ignoreCancelled=true)
    public void onPlayerCommand(PlayerCommandPreprocessEvent e) {
        Parsed p=parse(e.getMessage(),e.getPlayer());
        if(p!=null) queue(p);
    }

    @EventHandler(priority=EventPriority.MONITOR, ignoreCancelled=true)
    public void onServerCommand(ServerCommandEvent e) {
        Parsed p=parse("/"+e.getCommand(),e.getSender());
        if(p!=null) queue(p);
    }

    private void queue(final Parsed p) {
        Bukkit.getScheduler().runTaskLaterAsynchronously(this, new Runnable() {
            @Override public void run() { send(p); }
        }, delay);
    }

    private Parsed parse(String raw, CommandSender sender) {
        if(raw==null) return null;
        String line=raw.trim();
        if(line.startsWith("/")) line=line.substring(1);
        String[] a=line.split("\\s+");
        if(a.length<2) return null;
        String command=a[0].toLowerCase(Locale.ROOT);
        int colon=command.lastIndexOf(':');
        if(colon>=0) command=command.substring(colon+1);
        if(!commands.contains(command)) return null;
        String target=a[1];
        if(target.length()<1 || target.length()>24 || target.contains(":")) return null;

        boolean temp=command.equals("tempban") || command.equals("tempbanip");
        int reasonStart=2;
        Date expires=null;
        if(temp && a.length>=3) {
            expires=parseDuration(a[2]);
            reasonStart=3;
        }
        StringBuilder reason=new StringBuilder();
        for(int i=reasonStart;i<a.length;i++){if(reason.length()>0)reason.append(' ');reason.append(a[i]);}
        String moderator=sender==null?"Unknown":sender.getName();
        if(moderator==null || moderator.trim().isEmpty()) moderator="CONSOLE";
        Parsed p=new Parsed();
        p.nickname=target;p.reason=reason.length()==0?"Не указана":reason.toString();p.moderator=moderator;p.expires=expires;p.raw=line;
        return p;
    }

    private Date parseDuration(String s) {
        if(s==null)return null;
        String v=s.toLowerCase(Locale.ROOT).trim();
        if(v.equals("perm")||v.equals("permanent")||v.equals("forever"))return null;
        try {
            long n=Long.parseLong(v.substring(0,v.length()-1));
            char u=v.charAt(v.length()-1);
            long ms;
            if(u=='s')ms=n*1000L; else if(u=='m')ms=n*60_000L; else if(u=='h')ms=n*3_600_000L;
            else if(u=='d')ms=n*86_400_000L; else if(u=='w')ms=n*604_800_000L; else if(u=='y')ms=n*31_536_000_000L;
            else return null;
            return new Date(System.currentTimeMillis()+ms);
        } catch(Exception ignored){return null;}
    }

    private void send(Parsed p) {
        String externalId=sha256(mode+"|"+p.nickname+"|"+p.moderator+"|"+p.raw+"|"+(p.expires==null?"":p.expires.getTime()));
        if(sent.contains(externalId))return;
        String expires=p.expires==null?null:iso(p.expires);
        String json="{"+
            ""nickname":""+json(p.nickname)+"","+
            ""reason":""+json(p.reason)+"","+
            ""moderator":""+json(p.moderator)+"","+
            ""expiresAt":"+(expires==null?"null":"""+expires+""")+","+
            ""mode":""+json(mode)+"","+
            ""type":"BAN","+
            ""server":""+json(mode)+"","+
            ""externalId":""+externalId+""}";
        HttpURLConnection con=null;
        try {
            if(apiKey==null || apiKey.trim().isEmpty() || apiKey.equals("PUT_SERVER_KEY_HERE")) {
                getLogger().warning("EPM API key is not configured."); return;
            }
            URL url=new URL(apiUrl+"/api/integrations/punishments");
            con=(HttpURLConnection)url.openConnection();
            con.setRequestMethod("POST");con.setConnectTimeout(8000);con.setReadTimeout(8000);
            con.setDoOutput(true);con.setRequestProperty("Content-Type","application/json; charset=UTF-8");
            con.setRequestProperty("X-EPM-API-Key",apiKey);
            byte[] body=json.getBytes(StandardCharsets.UTF_8);con.setFixedLengthStreamingMode(body.length);
            OutputStream out=con.getOutputStream();out.write(body);out.close();
            int code=con.getResponseCode();
            if(code>=200 && code<300){sent.add(externalId);getLogger().info("Synced ban: "+p.nickname+" -> "+mode);}
            else getLogger().warning("EPM API returned HTTP "+code+": "+read(con.getErrorStream()));
        } catch(Exception ex){getLogger().warning("EPM sync failed: "+ex.getMessage());}
        finally{if(con!=null)con.disconnect();}
    }

    private static String json(String s){return s==null?"":s.replace("\\","\\\\").replace(""","\\"").replace("\n","\\n").replace("\r","\\r");}
    private static String iso(Date d){SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(d);}
    private static String read(InputStream in){if(in==null)return "";try{BufferedReader r=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();String x;while((x=r.readLine())!=null)b.append(x);return b.toString();}catch(Exception e){return "";}}
    private static String sha256(String s){try{MessageDigest m=MessageDigest.getInstance("SHA-256");byte[] b=m.digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder x=new StringBuilder();for(byte q:b)x.append(String.format("%02x",q));return x.toString();}catch(Exception e){return String.valueOf(s.hashCode());}}
    private static final class Parsed {String nickname,reason,moderator,raw;Date expires;}
}
