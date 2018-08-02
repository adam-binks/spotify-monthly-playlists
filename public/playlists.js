var MAX_RETRIES = 3;

function generate_playlists() {
    var access_token = localStorage.getItem('access_token');
    var refresh_token = localStorage.getItem('refresh_token');

    get_all_tracks(access_token);
}

// tracks can be grabbed 50 at a time, so keep getting tracks until there are no more to get
function get_all_tracks(access_token) {
    var tracks = [];
    var first_url = 'https://api.spotify.com/v1/me/tracks?offset=0&limit=50';

    get_next_batch_of_tracks(tracks, first_url, access_token);
}

function get_next_batch_of_tracks(tracks, api_url, access_token) {
    $.ajax({
        url: api_url,
        headers: {
            'Authorization': get_auth_header(access_token)
        },
        success: function(response) {
            tracks = tracks.concat(response.items);
            if (response.next) {
                get_next_batch_of_tracks(tracks, response.next, access_token);
            } else {
                if (tracks.length != response.total) {
                    console.log("warning: " + tracks.length + " fetched, when expecting " + response.total);
                }
                all_tracks_fetched(tracks, access_token);
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

function create_and_populate_playlist(playist_name, tracks, access_token, retries = 0) {
    $.ajax({
        url: "https://api.spotify.com/v1/me/playlists",
        headers: {
            'Authorization': get_auth_header(access_token),
            'Content-Type': 'application/json'
        },
        method: "POST",
        data: JSON.stringify({
            name: playist_name,
            public: true,
            description: "Created by monthly playlists generator: https://github.com/adam-binks/website"
        }),
        success: function(response) {
            console.log("generateed " + playist_name + " at " + response.uri);
        },
        statusCode: {
            502: function(response, status) {
                console.log("Failed to create playlist " + playist_name + ": " + status);

                if (retries < MAX_RETRIES) {
                    console.log("Retrying create playlist " + playist_name + ", retry " + retries + 1);
                    create_and_populate_playlist(playist_name, tracks, access_token, retries + 1);
                } else {
                    console.log("Exceeded max retries for create playlist " + playlist_name);
                }
            }
        }
    });
}

function populate_playlist() {
    // todo
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
        dated_tracks[added.year][added.month].push(track.track);
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
