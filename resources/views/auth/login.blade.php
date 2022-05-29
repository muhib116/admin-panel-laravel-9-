<x-guest-layout>
  @section('style')
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;700&display=swap');
        body{
          height: 100vh;
          display: grid;
          place-content: center;
          font-family: 'Poppins', sans-serif;
          font-weight: 300;
        }
        .m_0{
          margin-bottom: 10px !important;
        }
        .remember_me > *{
          display: flex;
          justify-content: center;
          align-content: center;
          margin: 0;
        }
        .remember_me input{
          margin-top: 6px;
        }

        .form_container {
            width: 800px;
            display: flex;
            position: relative;
            border-radius: 15px;
            border: 1px solid #0002;
            transition: 0.5s ease-in-out;
        }

        .form_container .sign_in,
        .form_container .sign_up {
            flex: 1;
        }


        /* overlay normal style start */
        .overlay_container {
            /*--------------------- */
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 50%;
            overflow: hidden;
            background-image: linear-gradient(orange, #ff3c00);
            text-align: center;
            transition: 0.5s ease-in-out;
        }

        .overlay_container .overlay {
            width: 200%;
            height: 100%;
            display: flex;
            align-items: center;
            transition: 0.5s ease-in-out;
        }


        .overlay_container .overlay>.left,
        .overlay_container .overlay>.right {
            flex: 1;
            padding: 25px;
            transition: 0.4s ease-in-out;
        }

        .overlay_container .overlay p {
            line-height: 1.8;
            margin: 10px 0;
        }

        .overlay_container .overlay .open_sign_in,
        .overlay_container .overlay .open_sign_up {
          background-color: #fff4;
          border: 1px solid #fff8;
          padding: 10px 30px;
          border-radius: 25px;
          font-weight: 600;
          box-shadow: 0 2px 5px #0002;
          cursor: pointer;
          outline: none;
          text-transform: uppercase;
          font-size: 12px;
        }

        /* overlay normal style end */


        /* overlay animation start */
        .form_container.active .overlay_container {
            transform: translateX(100%);
        }

        .form_container.active .overlay_container .overlay {
            transform: translateX(-50%);
        }

        .form_container .overlay_container .overlay .right {
            transform: translateX(40%);
        }

        .form_container.active .overlay_container .overlay .right {
            transform: translateX(0%);
        }

        .form_container.active .overlay_container .overlay .left {
            transform: translateX(-40%);
        }

        /* overlay animation end */


        /* now decorate the form start */
        .form_container {
            box-shadow: 0 2px 30px #0001, 0 2px 20px #0001, 0 0 1px #0001;
        }

        .form_container .sign_in,
        .form_container .sign_up {
            padding: 45px 35px;
            display: grid;
            align-items: center;
        }

        .form_title {
            text-align: center;
            margin: 20px 0 40px;
            color: #000;
            text-transform: uppercase;
        }

        .form_group {
            margin-bottom: 20px;
        }

        .form_control {
          display: block;
          width: 100%;
          padding: 8px 15px;
          border-radius: 2px;
          outline: none;
          border: 1px solid #0002;
          color: #333;
          background-color: transparent;
          font-size: 0.9rem;
          font-family: inherit;
          transition: 0.3s ease-in-out;
        }

        .form_control::placeholder {
            color: inherit;
            opacity: 0.5;
        }

        .form_control:hover,
        .form_control:focus {
            background-color: transparent;
            box-shadow: inset 0px 1px 6px #0002;
        }

        .submit_btn {
          border: none;
          outline: none;
          cursor: pointer;
          padding: 8px 30px;
          font-size: 12px;
          display: block;
          margin: 0px auto;
          border-radius: 50px;
          background-color: orangered;
          background-image: linear-gradient(-45deg, orange, orangered);
          color: #fff;
          box-shadow: 0 2px 6px #0002;
          text-transform: uppercase;
          transition: 0.3s ease-in-out;
        }


        .submit_btn:hover {
            box-shadow: 0 3px 12px #0005;
            letter-spacing: 1px;
        }

        .submit_btn:active {
            box-shadow: 0 2px 5px #0003;
            transform: scale(0.97);
            letter-spacing: 0;
        }

        .form_footer_link {
            text-decoration: none;
            display: block;
            width: fit-content;
            margin: auto;
            color: #0007;
            font-weight: 400;
            font-size: 14px;
            margin-bottom: -10px;
            transition: 0.3s ease-in-out;
        }

        .form_footer_link:hover {
            color: orangered;
            letter-spacing: 1px;
        }

        .form_footer_link:active {
            letter-spacing: 0;
        }

        .forgot_password_wrapper{
          position: relative;
        }
        .forgot_password_wrapper button{
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translate(0%, -50%);
        }
      </style>
  @endsection


  <div class="form_container active">

    <div class="sign_in">
      <form method="POST" action="{{ route('login') }}">
        @csrf
        <h2 class="form_title">Sign In</h2>
        <div class="form_group">
          <input type="email" name="email" autofocus="autofocus" class="form_control" placeholder="Email" required>
        </div>

        <div class="form_group password_toggle_wrapper">
          <input type="password" name="password" id="login_passowrd" class="form_control" placeholder="Password" required="required" autocomplete="current-password">
          <x-PasswordToggle selector="#login_passowrd"/>
        </div>

        <div class="form_group">
          <button type="submit" class="submit_btn">
            {{ __('Log in') }}
          </button>
        </div>

        <div class="form_group remember_me m_0">
          <label for="remember_me">
              <input id="remember_me" type="checkbox" name="remember">
              &nbsp;
              <span>{{ __('Remember me') }}</span>
          </label>
        </div>

        @if (Route::has('password.request'))
          <div class="form_group m_0">
            <a href="{{ route('password.request') }}" class="form_footer_link">
              {{ __('Forgot your password?') }}
            </a>
          </div>
        @endif

      </form>
    </div>


    <div class="sign_up">
      <form method="POST" action="{{ route('register') }}">
        @csrf
        <h2 class="form_title">Sign Up</h2>

        <div class="form_group">
          <input type="text" name="name" autofocus="autofocus" class="form_control" placeholder="Name..." required="required">
        </div>

        <div class="form_group">
          <input type="email" name="email" class="form_control" placeholder="Email.." required="required">
        </div>

        <div class="form_group password_toggle_wrapper">
          <input type="password" id="reg_login_passowrd" name="password" class="form_control" placeholder="Password..." required="required" autocomplete="new-password">
          <x-PasswordToggle selector="#reg_login_passowrd"/>
        </div>

        <div class="form_group password_toggle_wrapper">
          <input type="password" id="reg_confirm_passowrd" name="password_confirmation" id="password_confirmation" name="password" class="form_control" placeholder="Confirm Password..." required="required" autocomplete="off">
          <x-PasswordToggle selector="#reg_confirm_passowrd"/>
        </div>

        <div class="form_group">
          <button type="submit" class="submit_btn">
            Sign Up
          </button>
        </div>
      </form>
    </div>

    <div class="overlay_container">
      <div class="overlay">
        <div class="left">
          <h3>Welcome Back</h3>
          <p>
            To keep connected with us please login with your personal info
          </p>
          <button class="open_sign_in">
            Sign In
          </button>
        </div>

        <div class="right">
          <h3>Hello, Friend!</h3>
          <p>
            Enter Your Personal Details and Start Journey With Us
          </p>
          <button class="open_sign_up">
            Sign Up
          </button>
        </div>
      </div>
    </div>
  </div>


  @section('script')
    <script>
      let form_container = document.querySelector('.form_container'),
          open_sign_in   = document.querySelector('.open_sign_in'),
          open_sign_up   = document.querySelector('.open_sign_up');


      open_sign_in.addEventListener('click', toggle_form);
      open_sign_up.addEventListener('click', toggle_form);


      function toggle_form() {
          form_container.classList.toggle('active');
      }
    </script>
  @endsection
</x-guest-layout>
