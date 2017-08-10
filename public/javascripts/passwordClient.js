function submitPassword () {
    var password = $('#password').val();
    if(password === ''){
        $('#error-text').text('Password darf nicht leer sein!');
    } else {
        $('#error-text').text('');

        var sendData = {
            'password': password,
            'id': userId
        };

        $.post('https://www.rocciberge.de:3000/resetPasswordInternal', sendData, function (data, status) {
            $('#error-text').css({color: 'black'});
            $('#password').css({display: 'none'});
            $('#submit').css({display: 'none'});
            $('#error-text').text('Passwort zurücksetzen erfolgreich! Du kannst die Seite jetzt schließen.');
        }).fail(function(xhr) {
            $('#error-text').text('Etwas ist schief gelaufen. Probier es später nochmal.');
        });
    }
}
