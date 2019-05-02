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
let timeouts = {};

function timeout(fn, time, name) {
  name = name || id.toString();
  const id = Mainloop.timeout_add(time, () => {
    fn();
    delete timeouts[name];
    return false;
  });

  if(timeouts[name]) cancelTimeout(name);
  timeouts[name] = id;
  return name;
}

function cancelTimeout(name) {
  return Mainloop.source_remove(timeouts[name]);
}

function hasTimeout(name) {
  return timeouts.hasOwnProperty(name);
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

function icon(ico_id) {
    /* TODO: Use a build system to configure this dir instead of hardcoding it */
    const iconFolder = '/usr/share/huayra-tdapplet/icon/';
    const logos = ['LogoUnknown', 'LogoInctive', 'LogoDisconnectedInactive',
                   'LogoAbouttoExpire', 'LogoDisconnectedActive', 'LogoDownload',
                   'LogoPermanent', 'LogoProtected', 'LogoInstall'];

    return iconFolder + (logos[ico_id] || logos[ICO_UNKNOWN]) + '.png';
}

const TD_CLIENT_APP = '/opt/TheftDeterrentclient/client/Theft_Deterrent_client.run --hide';
const TD_CLIENT_APP_INFO = Gio.app_info_create_from_commandline(TD_CLIENT_APP, null, 0, null);

function openClient(timeout_time) {
    timeout_time = timeout_time || 2000;
    failed = false;

    try {
        if(TD_CLIENT_APP_INFO.launch([], null)) {
            Menu = placeholderMenu();
            lastText = 'Conectando al cliente';

            timeout(() => {
                TDClient.GetMenuItemInfoRemote('GET-MENU', refreshMenu);
                TDClient.GetInfoRemote('GET-ICON', refreshIcon);
            }, timeout_time, 'OPEN_CLIENT');
        } else {
            throw new Error('El cliente falló al iniciarse');
        }
    } catch (error) {
        errorMode(error);
    }
}

function placeholderMenu() {
    let new_menu = new Gtk.Menu();
    new_menu.append(new Gtk.MenuItem({ label: 'Conectando al cliente' }));
    new_menu.append(new Gtk.SeparatorMenuItem());

    let quit = new Gtk.MenuItem({ label: Gettext.gettext('Close') });
    quit.connect('activate', Gtk.main_quit);
    new_menu.append(quit);

    new_menu.show_all();

    return new_menu;
}

//Init menu
let Menu = placeholderMenu();

let failed = false;

function errorMode(error) {
    log(error);

    if(failed) return; // Already in error mode

    failed = true;
    lastIcon = -1;
    lastText = 'Falló la conexión al cliente';

    new Notify.Notification({
        icon_name: icon(ICO_UNKNOWN),
        summary: 'Theft Deterrent',
        body: 'Falló en conectar al cliente de Theft Deterrent, podés reintentar manualmente'
    }).show();

    const new_menu = new Gtk.Menu();

    const retry = new Gtk.MenuItem({ label: 'Reintentar conexión' });
    retry.connect('activate', () => openClient());
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
let lastText = 'Conectando al cliente';

function refreshIcon(data, error) {
    if (data == null) {
        errorMode(error);
        return;
    }

    const icon_id = data[0]['id'];
    const icon_file_m = icon(icon_id);

    const notification_text = data[0]['header'];

    if(lastIcon === icon_id && lastText === notification_text) return;
    else { lastIcon = icon_id; lastText = notification_text }

    StatusIcon.set_from_file(icon_file_m);

    new Notify.Notification({
        icon_name: icon_file_m,
        summary: 'Theft Deterrent',
        body: notification_text
    }).show();
}

function TDInfoChanged(proxy, sender, msg) {
    refreshIcon(msg);

    //If an event has arrived and the application is initializing it's safe to accelerate the process
    if(cancelTimeout('OPEN_CLIENT')) {
        TDClient.GetMenuItemInfoRemote('GET-MENU', refreshMenu);
    }
    //If the application is in a failed state this event gives hope
    else if(failed) {
        TDClient.GetMenuItemInfoRemote('GET-MENU', refreshMenu);
        failed = false;
    }
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
openClient(60000)

//StatusIcon menu
StatusIcon['has-tooltip'] = true;
StatusIcon.connect('popup-menu', function popup_menu(icon, button, time) {
    Menu.popup(null, null, null, button, time);
});

const TD_SHOW_APP = '/opt/TheftDeterrentclient/client/Theft_Deterrent_client.run';
const TD_SHOW_APP_INFO = Gio.app_info_create_from_commandline(TD_SHOW_APP, null, 0, null);

StatusIcon.connect('activate', function show_tdclient() {
    TD_SHOW_APP_INFO.launch([], null);
});

StatusIcon.connect('query-tooltip', function show_tooltip(statusIcon, x, y, keymode, tooltip) {
  tooltip.set_text('Theft Deterrent Client: ' + lastText);
  return true;
});

Gtk.main();
Notify.uninit();
