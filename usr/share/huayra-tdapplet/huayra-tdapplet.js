imports.gi.versions.Gtk = '3.0';

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Notify = imports.gi.Notify;
const Gettext = imports.gettext;
const Mainloop = imports.mainloop;

//Init libraries
Gettext.textdomain('gtk30');
Gtk.init(null, 0);
Notify.init('Theft Deterrent Notifications');

//Timeout
function timeout(fn, time) {
  Mainloop.timeout_add(time, () => (fn(), false));
}

//Icon constants
const ICO_UNKNOWN = '0';
const ICO_CONNECTED_INACTIVE = '1';
const ICO_DISCONNECTED_INACTIVE_URI = '2';
const ICO_ABOUT_EXPIRE = '3';
const ICO_DISCONNECTACTIVE = '4';
const ICO_DOWNLOADING = '5';
const ICO_PERMANENT = '6';
const ICO_PROTECTED = '7';
const ICO_UPGRADING = '8';

function icon(ico_id, isMedium) {
    /* TODO: Use a build system to configure this dir instead of hardcoding it */
    const iconFolder = '/usr/share/huayra-tdapplet/icon/';
    const logos = ['LogoUnknown', 'LogoInctive', 'LogoDisconnectedInactive',
                   'LogoAbouttoExpire', 'LogoDisconnectedActive', 'LogoDownload',
                   'LogoPermanent', 'LogoProtected', 'LogoInstall'];

    return iconFolder + (logos[ico_id] || logos[ICO_UNKNOWN]) + (isMedium ? '_m' : '_s') + '.png';
}

function openClient() {
    failed = false;

    const TD_CLIENT_APP = '/opt/TheftDeterrentclient/client/Theft_Deterrent_client.run --hide';
    let app_info = Gio.app_info_create_from_commandline(TD_CLIENT_APP, null, 0, null);

    try {
        if(app_info.launch([], null)) {
            timeout(() => TDClient.GetMenuItemInfoRemote('GET-MENU', refreshMenu), 2000);
            timeout(() => TDClient.GetInfoRemote('GET-ICON', refreshIcon), 2000);
        } else {
            throw new Error('El cliente falló al iniciarse');
        }
    } catch (error) {
        errorMode(error);
    }
}

let Menu = new Gtk.Menu();
let failed = false;

function errorMode(error) {
    log(error);

    if(failed) return; // Already in error mode

    failed = true;
    lastIcon = -1;

    new Notify.Notification({
        icon_name: icon(ICO_UNKNOWN, true),
        summary: 'Theft Deterrent',
        body: 'Falló en conectar al cliente de Theft Deterrent, podés reintentar manualmente'
    }).show();

    const new_menu = new Gtk.Menu();

    const retry = new Gtk.MenuItem({ label: 'Reintentar conexión' });
    retry.connect('activate', openClient);
    new_menu.append(retry);

    new_menu.append(new Gtk.SeparatorMenuItem());

    const quit = new Gtk.MenuItem({ label: Gettext.gettext('Close') });
    quit.connect('activate', Gtk.main_quit);
    new_menu.append(quit);

    new_menu.show_all();

    Menu = new_menu;

    StatusIcon.set_from_file(icon(ICO_UNKNOWN));
}

function refreshMenu(data, error) {
    if(data == null) {
        errorMode(error);
        return;
    }

    const menu_data = data[0];
    const new_menu = new Gtk.Menu();

    Object.keys(menu_data).forEach(keyname => {
        const menu_item = new Gtk.MenuItem({ label: menu_data[keyname] });

        menu_item.connect('activate',
            () => TDClient.OnMenuItemClickRemote(keyname,
                (_, error) => { if(error) errorMode(error) }));

        new_menu.append(menu_item);
    });

    new_menu.append(new Gtk.SeparatorMenuItem());

    const quit = new Gtk.MenuItem({ label: Gettext.gettext('Close') });
    quit.connect('activate', Gtk.main_quit);
    new_menu.append(quit);

    new_menu.show_all();

    Menu = new_menu;
}

const StatusIcon = Gtk.StatusIcon.new_from_file(icon(ICO_UNKNOWN));
let lastIcon = -1; // First notification is important

function refreshIcon(data, error) {
    if (data == null) {
        errorMode(error);
        return;
    }

    const icon_id = data[0]['id'];
    const icon_file_s = icon(icon_id);
    const icon_file_m = icon(icon_id, true);

    if(lastIcon === icon_id) return;
    else lastIcon = icon_id;

    StatusIcon.set_from_file(icon_file_s);

    const notification_text = data[0]['header'];

    new Notify.Notification({
        icon_name: icon_file_m,
        summary: 'Theft Deterrent',
        body: notification_text
    }).show();
}

function TDInfoChanged(proxy, sender, msg) {
    refreshIcon(msg);
}

const TDIface = '<node> \
<interface name="com.intel.cmpc.td.client"> \
    <method name="GetInfo"> \
        <arg direction="out"  type="a{ss}" /> \
        <arg direction="in" type="s" /> \
    </method> \
    <method name="OnMenuItemClick"> \
        <arg direction="in" type="s" /> \
    </method> \
    <method name="GetMenuItemInfo"> \
        <arg direction="in" type="s" /> \
        <arg direction="out" type="a{ss}" /> \
    </method> \
    <signal name="TDInfoChanged"> \
        <arg direction="out" type="a{ss}" /> \
    </signal> \
</interface> \
</node>';

//Create the remote object, based on the correct path and bus name
const TDProxy = Gio.DBusProxy.makeProxyWrapper(TDIface);
const TDClient = new TDProxy(Gio.DBus.session,
                             'com.intel.cmpc.td.client',
                             '/com/intel/cmpc/td/client');

//Set the delegate to the TDInfoChanged Event
TDClient.connectSignal('TDInfoChanged', TDInfoChanged);

//Load initial data
openClient()

//StatusIcon menu
StatusIcon.connect('popup-menu', function popup_menu(icon, button, time) {
    Menu.popup(null, null, null, button, time);
});

Gtk.main();
Notify.uninit();
