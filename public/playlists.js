const MAX_RETRIES = 3; // stop resending requests after this many error statuses
const MAX_TRACKS_TO_ADD_TO_PLAYLIST = 100; // spotify api lets you add 100 tracks in one POST
const MAX_SONGS_IN_PLAYLIST = 10000; // maximum number of songs allowed in a spotify playlist

const DESCRIPTION = "Created by monthly playlists generator: https://github.com/adam-binks/website";

function generate_playlists() {
    var access_token = localStorage.getItem('access_token');
    var refresh_token = localStorage.getItem('refresh_token');

    get_all_tracks(access_token);
}

// tracks can be grabbed 50 at a time, so keep getting tracks until there are no more to get
function get_all_tracks(access_token) {
    var tracks = [];
    var first_url = 'https://api.spotify.com/v1/me/tracks?offset=0&limit=50';

    get_next_batch_of_items(tracks, first_url, access_token, all_tracks_fetched);
}

function get_next_batch_of_items(items, api_url, access_token, on_finished) {
    $.ajax({
        url: api_url,
        headers: {
            'Authorization': get_auth_header(access_token)
        },
        success: function(response) {
            items = items.concat(response.items);
            if (response.next) {
                get_next_batch_of_items(items, response.next, access_token, on_finished);
            } else {
                if (items.length != response.total) {
                    console.log("warning: " + items.length + " fetched, when expecting " + response.total);
                }
                on_finished(items, access_token);
            }
        }
    });
}

function all_tracks_fetched(tracks, access_token) {
    var dated_tracks = get_dated_tracks(tracks);
    $.each(dated_tracks, function(year, months) {
        $.each(months, function(month, tracks) {
            create_and_populate_playlist(month + " " + year, tracks, access_token);
        });
    });
}

function create_and_populate_playlist(playlist_name, tracks, access_token, retries = 0) {
    $.ajax({
        url: "https://api.spotify.com/v1/me/playlists",
        headers: {
            'Authorization': get_auth_header(access_token),
            'Content-Type': 'application/json'
        },
        method: "POST",
        data: JSON.stringify({
            name: playlist_name,
            public: true,
            description: DESCRIPTION
        }),
        success: function(response) {
            populate_playlist(response.id, tracks, access_token);
        },
        statusCode: {
            // spotify API seems to quite often give random 502 that 200 on the first retry
            502: function(response, status) {
                console.log("Failed to create playlist " + playlist_name + ": " + status);

                if (retries < MAX_RETRIES) {
                    console.log("Retrying create playlist " + playlist_name + ", retry " + retries + 1);
                    create_and_populate_playlist(playlist_name, tracks, access_token, retries + 1);
                } else {
                    console.log("Exceeded max retries for create playlist " + playlist_name);
                }
            }
        }
    });
}

function populate_playlist(playlist_id, tracks, access_token) {
    if (playlist_id === null || playlist_id === "") {
        console.log("Error: invalid playlist id " + playlist_id);
        return;
    }

    var user_id = get_my_user_id();
    console.log("user_id " + user_id);

    // can only add 100 tracks at a time so do multiple requests if need be
    var track_uris = [];
    tracks.forEach(function(track) {
        track_uris.push(track.uri);
        if (track_uris.length >= MAX_TRACKS_TO_ADD_TO_PLAYLIST) {
            add_tracks_to_playlist(playlist_id, track_uris, user_id, access_token);
            track_uris = [];
        }
    });
    // add any remaining songs for this month
    if (track_uris.length > 0) {
        add_tracks_to_playlist(playlist_id, track_uris, user_id, access_token);
    }
}

function add_tracks_to_playlist(playlist_id, track_uris, user_id, access_token) {
    $.ajax({
        url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists/' + playlist_id + '/tracks',
        headers: {
            'Authorization': get_auth_header(access_token),
            'Content-Type': 'application/json'
        },
        method: "POST",
        data: JSON.stringify({
            "uris": track_uris
        }),
        success: function(response) {
            console.log("added " + track_uris.length + " to " + playlist_id);
        }
    });
}

// given a list of {"track": { ... }, "added_at": "2016-10-24T15:03:07Z"} objects
// returns an object {"2016": "09": [{ ... }, { ... }], "10": [{ ... }, { ... }]}}
function get_dated_tracks(tracks) {
    var dated_tracks = {};
    tracks.forEach(function(track) {
        var added = get_month_year(track.added_at);
        if (!(added.year in dated_tracks)) {
            dated_tracks[added.year] = {};
        }
        if (!(added.month in dated_tracks[added.year])) {
            dated_tracks[added.year][added.month] = [];
        }

        if (dated_tracks[added.year][added.month].length >= MAX_SONGS_IN_PLAYLIST) {
            console.log("Wow, you saved more than " + MAX_SONGS_IN_PLAYLIST + " in a month!"
                + " Ignoring the last few songs because that's the limit for Spotify playlists");
        } else {
            dated_tracks[added.year][added.month].push(track.track);
        }
    });
    return dated_tracks;
}

// date should be in ISO 8601 format which is the one used by the Spotify API
// eg "2016-10-24T15:03:07Z"
function get_month_year(date) {
    return {
        month: date.substring("2016-".length, "2016-10".length),
        year:  date.substring("".length,      "2016".length)
    }
}

function get_auth_header(access_token) {
    return 'Bearer ' + access_token;
}

function get_my_user_id() {
    return $('#spotify-user-id').text();
}

function unfollow_all_playlists() {
    var access_token = localStorage.getItem('access_token');
    var refresh_token = localStorage.getItem('refresh_token');

    get_all_playlists(access_token);
}

function get_all_playlists(access_token) {
    var playlists = [];
    var first_url = 'https://api.spotify.com/v1/me/playlists?offset=0&limit=50';
    get_next_batch_of_items(playlists, first_url, access_token, all_playlists_fetched);
}

function all_playlists_fetched(playlists, access_token) {
    playlists.forEach(function(playlist) {
        if(playlist_is_generated_by_this(playlist)) {
            unfollow_playlist(playlist, access_token);
        }
    });
}

// check if the playlist owner is this user, and playlist name is like "01 2018"
// where the first number is between 01 and 12
// and the second number is between 2000 and 2020
function playlist_is_generated_by_this(playlist) {
    if (playlist.owner.id != get_my_user_id()) {
        return false;
    }

    if (playlist.name.length != "01 2018".length) {
        return false;
    }

    var years = get_range_array(2000, 2020);
    var months = get_range_array(1, 12);
    var playlist_month = playlist.name.substring("".length, "01".length);
    var playlist_year = playlist.name.substring("01 ".length, "01 2016".length);
    if ($.inArray(playlist_month, months) && $.inArray(playlist_year, years)) {
        return true;
    }

    return false;
}

function get_range_array(from, to) {
    var arr = [];
    for (var i = from; i <= to; i++) {
        arr.push(i.toString());
    }
    return arr;
}

// spotify doesn't have the concept of deleting your own playlists
// but unfollowing is pretty much the same thing as long as no one else is
// following it
// THIS ACTUALLY DOESN'T WORK
function unfollow_playlist(playlist, access_token, retries = 0) {
    var user_id = get_my_user_id();
    $.ajax({
        url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists/' + playlist.id + '/followers',
        headers: {
            'Authorization': get_auth_header(access_token)
        },
        method: "DELETE",
        success: function(response) {
            console.log("unfollowed playlist " + playlist.name);
        },
        statusCode: {
            // spotify API seems to quite often give random 502 that 200 on the first retry
            502: function(response, status) {
                console.log("Failed to unfollow playlist " + playlist.name + ": " + status);

                if (retries < MAX_RETRIES) {
                    console.log("Retrying unfollow playlist " + playlist.name + ", retry " + retries + 1);
                    unfollow_playlist(playlist, access_token, retries + 1);
                } else {
                    console.log("Exceeded max retries for unfollow playlist " + playlist.name);
                }
            }
        }
    });
}
