
requirejs.config({
    paths: {
		postmonger: 'postmonger'
    },
    shim: {
        'jquery.min': {
            exports: '$'
        },
		'custom': {
			deps: ['jquery.min', 'postmonger']
		}
    }
});

requirejs( ['jquery.min', '../index'], function( $, custom ) {
	console.log( 'REQUIRE LOADED' );
});

requirejs.onError = function( err ) {
	//console.log( "REQUIRE ERROR: ", err );
	if( err.requireType === 'timeout' ) {
		console.log( 'modules: ' + err.requireModules );
	}

	throw err;
};
